import { h } from "../dom";
import { stopStream } from "../capture";
import { FaceReader } from "../face";
import { timecode, uid } from "../format";
import { show, type Screen } from "../nav";
import { SessionRecorder } from "../recorder";
import { calibrate, rawSignals, Scorer, type Raw } from "../signals";
import { drawTimeline } from "../timeline";
import { findMoments, THRESHOLD } from "../moments";
import { addThumbs } from "../thumbs";
import { saveSession } from "../store";
import type { Sample, Session } from "../types";
import { reviewScreen } from "./review";
import { setupScreen } from "./setup";

export type RecordCtx = { game: MediaStream; cam: MediaStream; tester: string; build: string };

export const CALIBRATION_SECONDS = 10;
const MIN_FACE_SHARE = 0.4; // calibration needs a face in at least this share of frames
const LIVE_WINDOW = 30;

export function recordScreen(ctx: RecordCtx): Screen {
  return (root) => {
    const gameVideo = h("video", { autoplay: true, muted: true, playsInline: true, class: "game" });
    const faceVideo = h("video", { autoplay: true, muted: true, playsInline: true, class: "face mirror" });
    gameVideo.srcObject = ctx.game;
    faceVideo.srcObject = ctx.cam;

    const clock = h("span", { class: "clock mono", id: "clock" }, "0:00");
    const stopBtn = h("button", { class: "danger", id: "stop", disabled: true }, "Stop");
    const markBtn = h("button", { class: "mark", id: "mark", disabled: true, title: "Shortcut: M" }, "Mark moment (M)");
    const status = h("span", { class: "rec-status", id: "rec-status" }, "Getting ready");
    const faceLost = h("span", { class: "face-lost", id: "face-lost", hidden: true }, "Face lost — the tester is out of the camera");
    const strip = h("canvas", { class: "strip", id: "strip" });
    const overlayBox = h("div", { class: "box" });
    const overlay = h("div", { class: "overlay", id: "overlay" }, overlayBox);

    root.append(
      h("main", { class: "record" },
        h("header", { class: "bar" }, status, clock, h("span", { class: "who" }, `${ctx.tester} · ${ctx.build}`), h("span", { class: "spacer" }), markBtn, stopBtn),
        h("div", { class: "stage" }, gameVideo, faceVideo, overlay),
        h("div", { class: "strip-wrap" },
          h("div", { class: "legend" },
            h("span", {}, h("i", { style: "background:var(--frus)" }), "Frustration"),
            h("span", {}, h("i", { style: "background:var(--joy)" }), "Delight"),
            h("span", { class: "spacer" }),
            faceLost,
          ),
          strip,
        ),
      ),
    );

    const say = (...kids: (Node | string)[]) => overlayBox.replaceChildren(...kids);
    let phase: "loading" | "calibrating" | "recording" | "stopping" | "done" = "loading";
    let reader: FaceReader | null = null;
    let rec: SessionRecorder | null = null;
    let scorer: Scorer | null = null;
    let calib: Raw[] = [];
    let calibFrames = 0;
    let lastFaceAt = 0;
    const samples: Sample[] = [];
    const marks: number[] = [];
    let tick = 0;
    let raf = 0;

    const onFace = (at: number, shapes: Record<string, number> | null, loud: number) => {
      if (phase === "calibrating") {
        calibFrames++;
        faceCheck.className = `face-check ${shapes ? "yes" : "no"}`;
        faceCheck.textContent = shapes ? "Face found" : "Can't see a face — move closer or face a light";
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

    const faceCheck = h("p", { class: "face-check" }, "Looking for a face…");

    const calibrateNow = () => {
      phase = "calibrating";
      calib = [];
      calibFrames = 0;
      overlay.hidden = false;
      status.textContent = "Calibrating";
      const count = h("div", { class: "count mono", id: "countdown" }, String(CALIBRATION_SECONDS));
      say(h("h2", {}, "Relax and look at the screen"), h("p", {}, "Flinch is learning your resting face. Just sit normally."), count, faceCheck);
      const t0 = performance.now();
      const timer = setInterval(() => {
        const left = CALIBRATION_SECONDS - (performance.now() - t0) / 1000;
        count.textContent = String(Math.max(0, Math.ceil(left)));
        if (left > 0) return;
        clearInterval(timer);
        if (phase !== "calibrating") return;
        if (calib.length < 20 || calib.length / Math.max(calibFrames, 1) < MIN_FACE_SHARE) {
          phase = "loading";
          status.textContent = "Calibration failed";
          say(
            h("h2", {}, "Couldn't see a face"),
            h("p", { id: "calib-failed" }, "The camera didn't find the tester's face for most of the ten seconds. Sit a little closer, face a window or lamp, then try again."),
            h("div", { class: "exports" },
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
      scorer = new Scorer(calibrate(calib));
      rec = new SessionRecorder(ctx.game, ctx.cam);
      rec.start();
      phase = "recording";
      overlay.hidden = true;
      stopBtn.disabled = false;
      markBtn.disabled = false;
      status.replaceChildren(h("i", { class: "rec-dot" }), "Recording");
      tick = window.setInterval(() => {
        clock.textContent = timecode(rec!.elapsed());
        faceLost.hidden = performance.timeOrigin + performance.now() - lastFaceAt < 1000;
      }, 250);
      const draw = () => {
        const t = rec!.elapsed();
        drawTimeline(strip, samples, { from: Math.max(0, t - LIVE_WINDOW), to: Math.max(LIVE_WINDOW, t), threshold: THRESHOLD });
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    };

    const finish = async () => {
      if (phase !== "recording" || !rec) return;
      phase = "stopping";
      clearInterval(tick);
      cancelAnimationFrame(raf);
      stopBtn.disabled = markBtn.disabled = true;
      status.textContent = "Finding moments…";
      reader?.stop();
      const recording = await rec.stop();
      stopStream(ctx.game);
      stopStream(ctx.cam);
      const moments = findMoments(samples, marks);
      await addThumbs(moments, recording);
      phase = "done";
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
      show(reviewScreen(session, videos, { unsaved: !saved }), `#/review/${session.id}`);
    };
    stopBtn.onclick = finish;
    const mark = () => {
      if (phase !== "recording" || !rec) return;
      marks.push(rec.elapsed());
      markBtn.textContent = `Marked ${marks.length} (M)`;
    };
    markBtn.onclick = mark;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "m" && !e.repeat && !(e.target instanceof HTMLInputElement)) mark();
    };
    addEventListener("keydown", onKey);
    // Stopping the share from Chrome's own bar ends the session instead of losing it.
    ctx.game.getVideoTracks()[0]?.addEventListener("ended", finish);
    ctx.cam.getVideoTracks()[0]?.addEventListener("ended", finish);

    say(h("h2", {}, "Loading the face reader…"), h("p", {}, "This takes a few seconds the first time."));
    FaceReader.start(ctx.cam).then(
      (r) => {
        reader = r;
        r.onFace = onFace;
        if (phase === "loading") calibrateNow();
      },
      (err) => {
        status.textContent = "Face reader failed";
        say(
          h("h2", {}, "The face reader couldn't start"),
          h("p", { id: "face-error" }, String(err?.message ?? err)),
          h("button", { class: "primary", onclick: () => show(setupScreen()) }, "Back to setup"),
        );
      },
    );

    return () => {
      removeEventListener("keydown", onKey);
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
