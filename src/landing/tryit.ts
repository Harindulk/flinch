/**
 * "Try it on your own face": the real face reader on the visitor's webcam, with a live reaction line
 * and pins that carry a snapshot of the face at that moment. Nothing is recorded or sent anywhere.
 */
import { h } from "../dom";
import { browserSupported, CaptureError, openCameraOnly, stopStream } from "../capture";
import { FaceReader } from "../face";
import { timecode } from "../format";
import { icon } from "../icons";
import { KIND_LABEL, strengthText } from "../labels";
import { findMoments, THRESHOLD } from "../moments";
import { calibrate, rawSignals, Scorer, type Raw } from "../signals";
import { drawTimeline } from "../timeline";
import { show } from "../nav";
import type { Moment, Sample } from "../types";
import "../tryit.css";

const CALIB_S = 4; // shorter than a real playtest's ten: this is a taster
const LIMIT_S = 60;
const WINDOW_S = 20;
// What to try, by seconds after calibration.
const PROMPTS: [number, string][] = [
  [0, "Frown like you just missed the jump for the fifth time."],
  [6, "Relax."],
  [10, "Now grin like you found the secret level."],
  [16, "Keep going: every clear change from your resting face gets a pin."],
];

export function tryIt(): { el: HTMLElement; stop: () => void } {
  const video = h("video", { autoplay: true, muted: true, playsInline: true, class: "y-video mirror", hidden: true });
  const say = h("p", { class: "y-say", id: "try-say", ariaLive: "polite" }, "Your camera stays off until you press the button.");
  const strip = h("canvas", { class: "y-strip", role: "img", ariaLabel: "Your live reaction line" });
  const example = h("span", { class: "y-example" }, "Example line");
  const pinsEl = h("div", { class: "y-pins", id: "try-pins" });
  // Dynamic import: setup imports home, which imports this file.
  const next = h("div", { class: "y-next", hidden: true },
    h("button", { class: "primary", id: "try-next", type: "button", onclick: () => void import("../screens/setup").then((m) => show(m.setupScreen())) }, "Start a real playtest"),
    h("span", { class: "y-small" }, "Records the game window too, so every pin replays what was on screen."),
  );
  const startBtn = h("button", { class: "primary l-cta", id: "try-camera", type: "button", disabled: !browserSupported() }, icon("camera"), "Turn on my camera");
  const stopBtn = h("button", { class: "secondary", id: "try-stop", type: "button", hidden: true }, icon("stop"), "Turn it off");
  const panel = h("div", { class: "y-panel idle", dataset: { ui: "" } },
    h("div", { class: "y-cam" }, video, h("div", { class: "y-idle" }, icon("face", "big"), h("span", {}, "Your face appears here"))),
    h("div", { class: "y-live" }, say, h("div", { class: "y-strip-wrap" }, strip, example), pinsEl, next),
  );

  // While the camera is off, an example line drifts by (clearly labelled) so the panel shows what's coming.
  let idleRaf = 0;
  const idle = () => {
    const now = performance.now() / 1000;
    const pts: Sample[] = [];
    for (let t = now - WINDOW_S; t <= now; t += 0.1) {
      const cyc = ((t % 14) + 14) % 14; // a frown at 4 s and a grin at 10 s of every 14
      const f = 0.4 + 6 * Math.exp(-((cyc - 4) ** 2) / 0.8) + 0.3 * Math.sin(t * 3.1);
      const d = 0.3 + 7 * Math.exp(-((cyc - 10) ** 2) / 1.0) + 0.3 * Math.sin(t * 2.3);
      pts.push({ t: t - (now - WINDOW_S), f, d, loud: 0, face: true });
    }
    drawTimeline(strip, pts, { from: 0, to: WINDOW_S, threshold: THRESHOLD });
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) idleRaf = requestAnimationFrame(idle);
  };
  idleRaf = requestAnimationFrame(idle);

  let cam: MediaStream | null = null;
  let reader: FaceReader | null = null;
  let tick = 0, raf = 0;
  let run = 0; // bumped by every start and stop, so a start still awaiting the camera or model knows it was cancelled
  let timers: number[] = [];
  const snaps: { t: number; src: string }[] = [];
  const snapCanvas = h("canvas", { width: 160, height: 120 });

  const tell = (text: string, error = false) => {
    say.textContent = text;
    say.classList.toggle("y-error", error);
  };
  const later = (ms: number, text: string) => timers.push(window.setTimeout(() => tell(text), ms));

  const stop = () => {
    run++;
    timers.forEach(clearTimeout);
    timers = [];
    clearInterval(tick);
    cancelAnimationFrame(raf);
    reader?.stop();
    reader = null;
    stopStream(cam);
    cam = null;
    video.srcObject = null;
    video.hidden = true;
    panel.classList.add("idle");
    example.hidden = false;
    cancelAnimationFrame(idleRaf);
    idleRaf = requestAnimationFrame(idle);
    startBtn.hidden = false;
    startBtn.disabled = !browserSupported();
    stopBtn.hidden = true;
  };
  const again = () => startBtn.replaceChildren(icon("camera"), "Try again");
  const fail = (text: string) => {
    stop();
    tell(text, true);
    again();
  };

  const renderPins = (moments: Moment[]) => {
    const near = (t: number) => snaps.reduce((best, s) => (Math.abs(s.t - t) < Math.abs(best.t - t) ? s : best), snaps[0]);
    pinsEl.replaceChildren(
      ...moments.slice(-6).map((m) =>
        h("article", { class: `y-pin ${m.kind}`, dataset: { kind: m.kind } },
          snaps.length ? h("img", { src: near(m.t).src, alt: `Your face at ${timecode(m.t)}` }) : h("div", { class: "thumb-missing" }),
          h("div", {}, h("span", { class: "d-time" }, timecode(m.t)), h("span", { class: "d-kind" }, KIND_LABEL[m.kind]), h("span", { class: "y-x" }, strengthText(m.strength))),
        ),
      ),
    );
  };

  const start = async () => {
    stop();
    const me = run;
    snaps.length = 0;
    pinsEl.replaceChildren();
    next.hidden = true;
    startBtn.disabled = true;
    tell("Asking for the camera…");
    // An embedded browser can leave the request hanging with no prompt: explain, and let them ask again.
    timers.push(window.setTimeout(() => {
      tell("No camera prompt? Look for the camera icon in the address bar. Browsers built into other apps often can't use the camera: open this page in Chrome.");
      startBtn.disabled = false;
      again();
    }, 8000));
    let stream: MediaStream;
    try {
      stream = await openCameraOnly();
    } catch (e) {
      if (me === run) fail(e instanceof CaptureError ? e.message : "Couldn't open the camera. Check it's plugged in and not used by another app, then try again.");
      return;
    }
    if (me !== run) return stopStream(stream); // turned off (or left the page) while the prompt was open
    timers.forEach(clearTimeout);
    timers = [];
    cam = stream;
    video.srcObject = cam;
    video.hidden = false;
    cancelAnimationFrame(idleRaf);
    example.hidden = true;
    panel.classList.remove("idle");
    startBtn.hidden = true;
    stopBtn.hidden = false;
    startBtn.disabled = false;
    tell("Loading the face reader…");
    later(6000, "Still downloading the face model (about 17 MB). Only the first time.");
    later(30000, "This is taking a while: a slow connection can need a minute. Keep waiting, or turn it off and try again.");
    let r: FaceReader;
    try {
      r = await FaceReader.start(cam);
    } catch {
      if (me === run) fail("The face reader couldn't start. Check your connection, then press Try again.");
      return;
    }
    if (me !== run) return r.stop();
    timers.forEach(clearTimeout);
    timers = [];
    reader = r;
    reader.onCrash = () => me === run && fail("The face reader stopped unexpectedly. Press Try again.");
    const calib: Raw[] = [];
    const samples: Sample[] = [];
    let scorer: Scorer | null = null;
    let t0 = performance.timeOrigin + performance.now();
    let phase: "calib" | "live" = "calib";
    let lastFace = 0, moments: Moment[] = [], shown = "";
    reader.onFace = (at, shapes, loud) => {
      if (shapes) lastFace = at;
      if (phase === "calib") {
        if (shapes) calib.push({ ...rawSignals(shapes), loud });
        return;
      }
      const t = (at - t0) / 1000;
      if (!shapes) return void samples.push({ t, f: 0, d: 0, loud: 0, face: false });
      const s = scorer!.push({ ...rawSignals(shapes), loud });
      samples.push({ t, f: s.f, d: s.d, loud: s.loud, face: true });
    };
    tick = window.setInterval(() => {
      const now = performance.timeOrigin + performance.now();
      const el = (now - t0) / 1000;
      const lost = now - lastFace > 1000;
      if (phase === "calib") {
        tell(lost ? "Can't see your face yet: face the camera and move into the light." : `Hold still, resting face… ${Math.max(1, Math.ceil(CALIB_S - el))}`);
        if (el < CALIB_S) return;
        if (calib.length < 15) {
          t0 = now; // keep calibrating until there's enough of a face
          calib.length = 0;
          return;
        }
        scorer = new Scorer(calibrate(calib));
        phase = "live";
        t0 = now;
        return;
      }
      if (el > LIMIT_S) {
        stop();
        tell(moments.length ? "That's the idea. In a real playtest each pin replays the game and the face together." : "No clear expression changes that time. Try again with a bigger frown or grin.");
        again();
        next.hidden = !moments.length;
        return;
      }
      const prompt = [...PROMPTS].reverse().find(([s]) => el >= s)![1];
      tell(lost ? "Can't see your face: face the camera and move into the light." : prompt);
      // A face snapshot every quarter second, kept for the last minute, so each pin can show the face at its peak.
      const g = snapCanvas.getContext("2d")!;
      g.save();
      g.scale(-1, 1);
      g.drawImage(video, -160, 0, 160, 120);
      g.restore();
      snaps.push({ t: el, src: snapCanvas.toDataURL("image/jpeg", 0.6) });
      if (snaps.length > 240) snaps.shift();
      moments = findMoments(samples).filter((m) => m.t > 0.5);
      const key = moments.map((m) => m.kind + m.t).join();
      if (key !== shown) {
        shown = key;
        renderPins(moments);
      }
    }, 250);
    const draw = () => {
      const el = phase === "live" ? (performance.timeOrigin + performance.now() - t0) / 1000 : 0;
      drawTimeline(strip, samples, { from: Math.max(0, el - WINDOW_S), to: Math.max(WINDOW_S, el), threshold: THRESHOLD, moments });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
  };

  startBtn.onclick = () => void start();
  stopBtn.onclick = () => {
    const pinned = pinsEl.childElementCount > 0;
    stop();
    tell("Camera off. Nothing was recorded.");
    again();
    next.hidden = !pinned;
  };

  const el = h("section", { class: "l-try l-wrap", id: "try" },
    h("div", { class: "y-copy" },
      h("h2", {}, "Try it on your own face"),
      h("p", {}, "Turn on your camera, hold still for four seconds, then pull the face you'd pull after missing a jump. Watch the line, then grin."),
      h("p", { class: "y-small" }, "Runs in this tab with the same face reader as a real playtest. Nothing is recorded or sent anywhere."),
      h("div", { class: "y-actions" }, startBtn, stopBtn),
    ),
    panel,
  );
  if (!browserSupported()) say.textContent = "This needs desktop Chrome or Edge.";
  return {
    el,
    stop: () => {
      stop();
      cancelAnimationFrame(idleRaf);
    },
  };
}
