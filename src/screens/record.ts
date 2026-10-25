import { h } from "../dom";
import { stopStream } from "../capture";
import { FaceReader } from "../face";
import { timecode, uid } from "../format";
import { icon } from "../icons";
import { SIGNAL_LABEL } from "../labels";
import { show, type Screen } from "../nav";
import { SessionRecorder, type Recording } from "../recorder";
import { download } from "../dom";
import { calibrate, rawSignals, Scorer, type Baseline, type Raw } from "../signals";
import { fillGaps, findGaps } from "../backfill";
import { drawTimeline } from "../timeline";
import { findMoments, THRESHOLD } from "../moments";
import { addThumbs } from "../thumbs";
import { saveSession } from "../store";
import type { Moment, Sample, Session } from "../types";
import { reviewScreen } from "./review";
import { setupScreen } from "./setup";

export type RecordCtx = { game: MediaStream; cam: MediaStream; tester: string; build: string };

export const CALIBRATION_SECONDS = 10;
const MIN_FACE_SHARE = 0.4; // calibration needs a face in at least this share of frames
const LIVE_WINDOW = 30;
const LONG_SESSION_S = 20 * 60; // past this, recordings held in memory get large

export function recordScreen(ctx: RecordCtx): Screen {
  return (root) => {
    const gameVideo = h("video", { autoplay: true, muted: true, playsInline: true, class: "game" });
    const faceVideo = h("video", { autoplay: true, muted: true, playsInline: true, class: "face mirror" });
    gameVideo.srcObject = ctx.game;
    faceVideo.srcObject = ctx.cam;

    const clock = h("span", { class: "clock mono", id: "clock" }, "0:00");
    const stopBtn = h("button", { class: "danger", id: "stop", disabled: true }, icon("stop"), "Stop");
    const markBtn = h("button", { class: "mark", id: "mark", disabled: true, title: "Shortcut: M" }, icon("flag"), "Mark", h("kbd", {}, "M"));
    const status = h("span", { class: "rec-status", id: "rec-status" }, "Getting ready");
    const liveCount = h("span", { class: "live-count", id: "live-count" });
    const faceChip = h("span", { class: "chip", id: "face-chip", hidden: true });
    const notice = h("span", { class: "chip warn", id: "long-session", hidden: true });
    const strip = h("canvas", { class: "strip", id: "strip", role: "img", ariaLabel: "Live reaction line for the last 30 seconds" });
    const overlayBox = h("div", { class: "box", role: "status" });
    const overlay = h("div", { class: "overlay", id: "overlay" }, overlayBox);

    root.append(
      h("main", { class: "record" },
        h("header", { class: "bar" },
          status, clock,
          h("span", { class: "who" }, `${ctx.tester} · ${ctx.build}`),
          liveCount,
          h("span", { class: "spacer" }),
          markBtn, stopBtn,
        ),
        h("div", { class: "stage" }, gameVideo, faceVideo, overlay),
        h("div", { class: "strip-wrap" },
          h("div", { class: "legend" },
            h("span", {}, h("i", { style: "background:var(--frus)" }), SIGNAL_LABEL.f),
            h("span", {}, h("i", { style: "background:var(--joy)" }), SIGNAL_LABEL.d),
            h("span", { class: "dim" }, "Dashed line: pin threshold"),
            h("span", { class: "spacer" }),
            notice,
            faceChip,
          ),
          strip,
        ),
      ),
    );

    const say = (...kids: (Node | string | null)[]) => overlayBox.replaceChildren(...kids.filter((k): k is Node | string => k !== null));
    let phase: "loading" | "calibrating" | "recording" | "stopping" | "done" = "loading";
    let reader: FaceReader | null = null;
    let rec: SessionRecorder | null = null;
    let scorer: Scorer | null = null;
    let baseline: Baseline | null = null;
    let calib: Raw[] = [];
    let calibFrames = 0;
    let lastFaceAt = 0;
    let lastFaces = 0;
    let crashed = false;
    const samples: Sample[] = [];
    const marks: number[] = [];
    let live: Moment[] = [];
    let tick = 0;
    let raf = 0;

    const faceCheck = h("p", { class: "face-check", id: "face-check" }, "Looking for a face…");

    const onFace = (at: number, shapes: Record<string, number> | null, loud: number, faces: number) => {
      lastFaces = faces;
      if (phase === "calibrating") {
        calibFrames++;
        faceCheck.className = `face-check ${shapes ? (faces > 1 ? "warn" : "yes") : "no"}`;
        faceCheck.textContent = !shapes
          ? "Can't see a face — sit closer or face a light"
          : faces > 1
            ? "Two faces in view — Flinch follows the nearest one"
            : "Face found";
        if (shapes) calib.push({ ...rawSignals(shapes), loud });
        return;
      }
      if (phase !== "recording" || !rec || !scorer) return;
      const t = (at - rec.startedAt) / 1000;
      if (t < 0) return;
      if (!shapes) {
        scorer.reset();
        samples.push({ t, f: 0, d: 0, loud: 0, face: false });
        return;
      }
      lastFaceAt = at;
      const s = scorer.push({ ...rawSignals(shapes), loud });
      samples.push({ t, f: round(s.f), d: round(s.d), loud: round(s.loud), face: true });
    };

    const updateFaceChip = () => {
      const lost = crashed || performance.timeOrigin + performance.now() - lastFaceAt > 1000;
      faceChip.hidden = false;
      faceChip.className = `chip ${crashed || lost || lastFaces > 1 ? "warn" : "ok"}`;
      faceChip.replaceChildren(
        icon(lost ? "alert" : "face"),
        crashed ? "Face reader stopped — recording continues" : lost ? "Face lost" : lastFaces > 1 ? "2 faces — following the nearest" : "Face tracked",
      );
    };

    const calibrateNow = () => {
      phase = "calibrating";
      calib = [];
      calibFrames = 0;
      overlay.hidden = false;
      status.textContent = "Calibrating";
      const count = h("div", { class: "count mono", id: "countdown" }, String(CALIBRATION_SECONDS));
      const bar = h("i", {});
      say(
        h("h2", {}, "Relax and look at the game"),
        h("p", {}, "Ten seconds to learn the tester's resting face. Sit normally — no need to stay perfectly still."),
        count,
        h("div", { class: "calib-bar" }, bar),
        faceCheck,
      );
      const t0 = performance.now();
      const timer = setInterval(() => {
        const left = CALIBRATION_SECONDS - (performance.now() - t0) / 1000;
        count.textContent = String(Math.max(0, Math.ceil(left)));
        bar.style.width = `${Math.min(100, (1 - left / CALIBRATION_SECONDS) * 100)}%`;
        if (left > 0) return;
        clearInterval(timer);
        if (phase !== "calibrating") return;
        if (calib.length < 20 || calib.length / Math.max(calibFrames, 1) < MIN_FACE_SHARE) {
          phase = "loading";
          status.textContent = "Calibration failed";
          say(
            icon("alert", "big warn"),
            h("h2", {}, "Couldn't see a face"),
            h("p", { id: "calib-failed" }, "The camera didn't find the tester's face for most of the ten seconds. Sit a little closer, face a window or lamp, then try again."),
            h("div", { class: "row" },
              h("button", { class: "primary", id: "retry", onclick: calibrateNow }, "Try again"),
              h("button", { class: "ghost", onclick: () => show(setupScreen()) }, "Back to setup"),
            ),
          );
          return;
        }
        startRecording();
      }, 100);
    };

    const startRecording = () => {
      baseline = calibrate(calib);
      scorer = new Scorer(baseline);
      rec = new SessionRecorder(ctx.game, ctx.cam);
      rec.onError = () => void finish();
      rec.start();
      phase = "recording";
      overlay.hidden = true;
      stopBtn.disabled = false;
      markBtn.disabled = false;
      status.replaceChildren(h("i", { class: "rec-dot" }), "Recording");
      let lastLive = 0;
      tick = window.setInterval(() => {
        const t = rec!.elapsed();
        clock.textContent = timecode(t);
        updateFaceChip();
        if (performance.now() - lastLive > 1000) {
          lastLive = performance.now();
          live = findMoments(samples, marks);
          const n = live.filter((m) => m.kind !== "mark").length;
          liveCount.textContent = n ? `${n} possible reaction${n === 1 ? "" : "s"}` : "";
        }
        if (t > LONG_SESSION_S) {
          notice.hidden = false;
          notice.replaceChildren(icon("alert"), "Long session — stop within a few minutes to keep it safe");
        }
      }, 250);
      const draw = () => {
        const t = rec!.elapsed();
        drawTimeline(strip, samples, { from: Math.max(0, t - LIVE_WINDOW), to: Math.max(LIVE_WINDOW, t), threshold: THRESHOLD, moments: live });
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    };

    const step = (label: string, id: string) => h("li", { id, class: "pending" }, icon("check"), label);
    const finish = async () => {
      if (phase !== "recording" || !rec) return;
      phase = "stopping";
      clearInterval(tick);
      cancelAnimationFrame(raf);
      stopBtn.disabled = markBtn.disabled = true;
      status.textContent = "Saving…";
      const steps = [step("Stopping the recording", "st-stop"), step("Finding possible reactions", "st-find"), step("Saving on this computer", "st-save")];
      fillStep = steps[1];
      overlay.hidden = false;
      say(h("h2", {}, "Wrapping up"), h("ol", { class: "steps-done" }, ...steps));
      const done = (i: number) => steps[i].classList.replace("pending", "done");
      reader?.stop();
      try {
        await wrapUp(done);
      } catch (e) {
        // Never leave the tester staring at "Saving…": say what failed and keep the recording reachable.
        phase = "done";
        stopStream(ctx.game);
        stopStream(ctx.cam);
        status.textContent = "Couldn't finish";
        say(icon("alert", "big warn"), h("h2", {}, "Something went wrong saving this playtest"), h("p", { id: "finish-error" }, (e as Error)?.message ?? String(e)),
          lastRecording ? h("button", { class: "primary", onclick: () => lastRecording && downloadRaw(lastRecording) }, icon("download"), "Download the recording") : null,
          h("button", { class: "ghost", onclick: () => show(setupScreen()) }, "Start again"));
      }
    };
    let lastRecording: Recording | null = null;
    let fillStep: HTMLElement | null = null;
    const wrapUp = async (done: (i: number) => void) => {
      const recording = await rec!.stop();
      lastRecording = recording;
      stopStream(ctx.game);
      stopStream(ctx.cam);
      done(0);
      if (baseline && findGaps(samples, recording.duration).length) {
        const label = fillStep!.lastChild!;
        await fillGaps(samples, recording.face, recording.duration, baseline, (f) => {
          label.textContent = `Reading gaps from the recording… ${Math.round(f * 100)}%`;
        }).catch(() => 0); // without the fill, the gaps simply stay shaded on the timeline
        label.textContent = "Finding possible reactions";
      }
      const moments = findMoments(samples, marks);
      await addThumbs(moments, recording);
      done(1);
      const session: Session = {
        id: uid(),
        tester: ctx.tester,
        build: ctx.build,
        createdAt: Date.now(),
        duration: recording.duration,
        mimeType: recording.mimeType,
        samples,
        moments,
      };
      const videos = { game: recording.game, face: recording.face };
      const saved = await saveSession(session, videos).then(() => true, () => false);
      done(2);
      phase = "done";
      show(reviewScreen(session, videos, { unsaved: !saved, fresh: true }), `#/review/${session.id}`);
    };
    stopBtn.onclick = () => void finish();
    const mark = () => {
      if (phase !== "recording" || !rec) return;
      marks.push(rec.elapsed());
      live = findMoments(samples, marks);
      markBtn.classList.add("flash");
      setTimeout(() => markBtn.classList.remove("flash"), 300);
    };
    markBtn.onclick = mark;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "m" && !e.repeat && !(e.target instanceof HTMLInputElement)) mark();
    };
    addEventListener("keydown", onKey);
    // A refresh or closed tab mid-session would lose the recording: ask first.
    const onUnload = (e: BeforeUnloadEvent) => {
      if (phase === "calibrating" || phase === "recording" || phase === "stopping") e.preventDefault();
    };
    addEventListener("beforeunload", onUnload);
    // Stopping the share from Chrome's own bar, or a camera being unplugged, ends the session instead of losing it.
    ctx.game.getVideoTracks()[0]?.addEventListener("ended", () => void finish());
    ctx.cam.getVideoTracks()[0]?.addEventListener("ended", () => void finish());

    const startReader = () => {
      phase = "loading";
      status.textContent = "Getting ready";
      say(h("div", { class: "spinner" }), h("h2", {}, "Loading the face reader…"), h("p", {}, "A few seconds the first time. It runs on this computer."));
      FaceReader.start(ctx.cam).then(
        (r) => {
          reader = r;
          r.onFace = onFace;
          r.onCrash = () => {
            crashed = true;
            if (phase === "calibrating") {
              phase = "loading";
              say(icon("alert", "big warn"), h("h2", {}, "The face reader stopped"), h("button", { class: "primary", onclick: startReader }, "Restart it"));
            }
          };
          if (phase === "loading") calibrateNow();
        },
        (err: unknown) => {
          status.textContent = "Face reader failed";
          say(
            icon("alert", "big warn"),
            h("h2", {}, "The face reader couldn't start"),
            h("p", { id: "face-error" }, `Flinch loads its face model from this site. Check the page is still being served, then try again. (${(err instanceof Error ? err.message : "unknown error").slice(0, 160)})`),
            h("div", { class: "row" },
              h("button", { class: "primary", id: "retry-reader", onclick: startReader }, "Try again"),
              h("button", { class: "ghost", onclick: () => show(setupScreen()) }, "Back to setup"),
            ),
          );
        },
      );
    };
    startReader();

    return () => {
      removeEventListener("keydown", onKey);
      removeEventListener("beforeunload", onUnload);
      clearInterval(tick);
      cancelAnimationFrame(raf);
      reader?.stop();
      if (phase !== "done" && phase !== "stopping") {
        stopStream(ctx.game);
        stopStream(ctx.cam);
      }
    };
  };
}

const round = (v: number) => Math.round(v * 100) / 100;

function downloadRaw(r: Recording) {
  const ext = r.mimeType.includes("mp4") ? "mp4" : "webm";
  download(r.game, `flinch-recording-game.${ext}`);
  setTimeout(() => download(r.face, `flinch-recording-face.${ext}`), 400);
}
