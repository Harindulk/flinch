import { h } from "./dom";
import { timecode } from "./format";
import { THRESHOLD } from "./moments";
import { KIND_LABEL, MEASURE_NOTE, STRENGTH_TIP } from "./labels";
import { loadVideo, seekTo } from "./player";
import { paintFrame } from "./thumbs";
import { drawTimeline } from "./timeline";
import type { Moment, Session, Videos } from "./types";

const COLOR = { frustration: "#ff5d5d", delight: "#b8f35a", mark: "#ffb547" } as const;
export const REEL_BEFORE = 3;
export const REEL_AFTER = 3;

export const keptMoments = (s: Session) => s.moments.filter((m) => !m.dismissed);

/** The container a recorder really wrote ("video/mp4" or "video/webm"), from its own mimeType. Pure: unit-tested. */
export const recordedType = (actual: string, asked?: string) =>
  (actual || asked || "").includes("mp4") ? "video/mp4" : "video/webm";

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();

/** The fix list: kept moments in time order, as a Markdown table. Pure: unit-tested. */
export function notesMarkdown(s: Session): string {
  const kept = keptMoments(s);
  const dismissed = s.moments.length - kept.length;
  const when = new Date(s.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  const lines = [
    `# Flinch playtest: ${s.tester} · ${s.build}`,
    "",
    `${when} · ${timecode(s.duration)} long · ${kept.length} moment${kept.length === 1 ? "" : "s"}`,
    "",
  ];
  if (!kept.length) lines.push("No moments were pinned in this session.");
  else {
    lines.push("| Time | Moment | Expression change | Note |", "|---|---|---|---|");
    for (const m of kept) lines.push(`| ${timecode(m.t)} | ${KIND_LABEL[m.kind]} | ${m.kind === "mark" ? "—" : `${m.strength.toFixed(1)}×`} | ${cell(m.note) || " "} |`);
  }
  if (dismissed) lines.push("", `${dismissed} pin${dismissed === 1 ? "" : "s"} dismissed as "not a reaction" and left out.`);
  lines.push(
    "",
    `${MEASURE_NOTE} Expression change: ${STRENGTH_TIP.charAt(0).toLowerCase()}${STRENGTH_TIP.slice(1)} Times are from the start of the recording.`,
    "",
  );
  return lines.join("\n");
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(r));

/**
 * Plays each kept moment (3 s before to 3 s after) into a canvas recorder, after a title card.
 * Sound goes into the recording only, never to the speakers.
 */
export async function makeReel(s: Session, videos: Videos, onProgress: (done: number, total: number) => void): Promise<Blob> {
  const kept = keptMoments(s);
  const W = 1280, H = 720;
  const cv = h("canvas", { width: W, height: H });
  const g = cv.getContext("2d")!;
  const strip = h("canvas", { width: 1100, height: 90 });
  const game = h("video", { playsInline: true });
  const face = h("video", { playsInline: true });
  let audio: AudioContext | undefined, stream: MediaStream | undefined, rec: MediaRecorder | undefined;
  const chunks: Blob[] = [];
  // A stalled seek must not hang the reel forever.
  const seek = (v: HTMLVideoElement, t: number) => Promise.race([seekTo(v, t), wait(3000)]);

  const card = async (title: string, sub: string, color: string, ms: number) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      g.fillStyle = "#111214";
      g.fillRect(0, 0, W, H);
      g.fillStyle = color;
      g.fillRect(W / 2 - 60, H / 2 - 74, 120, 5);
      g.textAlign = "center";
      g.fillStyle = "#ecebe6";
      g.font = "600 64px system-ui, sans-serif";
      g.fillText(title, W / 2, H / 2 + 10);
      g.fillStyle = "#8d8f96";
      g.font = "28px system-ui, sans-serif";
      g.fillText(sub, W / 2, H / 2 + 62, W - 160);
      await frame();
    }
  };

  const clip = async (m: Moment) => {
    const from = Math.max(0, m.t - REEL_BEFORE), to = Math.min(s.duration, m.t + REEL_AFTER);
    await Promise.all([seek(game, from), seek(face, from)]);
    await game.play();
    face.play().catch(() => {}); // a missing face clip leaves the corner still, not the reel broken
    const deadline = performance.now() + (to - from) * 1000 + 3000; // a stalled video ends the clip instead of hanging
    while (game.currentTime < to && !game.ended && performance.now() < deadline) {
      if (Math.abs(face.currentTime - game.currentTime) > 0.15) face.currentTime = game.currentTime;
      paintFrame(g, game, face, W, H);
      // Moment label, top left.
      g.font = "600 26px system-ui, sans-serif";
      const label = `${timecode(m.t)} · ${KIND_LABEL[m.kind]}`;
      g.textAlign = "left";
      g.fillStyle = "rgba(17,18,20,0.85)";
      g.beginPath();
      g.roundRect(24, 24, g.measureText(label).width + 48, 50, 25);
      g.fill();
      g.fillStyle = COLOR[m.kind];
      g.beginPath();
      g.arc(46, 49, 7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#ecebe6";
      g.fillText(label, 62, 58);
      // The reaction line around the moment, bottom left.
      drawTimeline(strip, s.samples, { from, to, moments: [m], playhead: game.currentTime, threshold: THRESHOLD, width: strip.width, height: strip.height });
      g.fillStyle = "rgba(17,18,20,0.8)";
      g.fillRect(24, H - 114, strip.width * 0.62 + 16, strip.height + 16);
      g.drawImage(strip, 32, H - 106, strip.width * 0.62, strip.height);
      await frame();
    }
    game.pause();
    face.pause();
  };

  try {
    await Promise.all([loadVideo(game, videos.game), loadVideo(face, videos.face)]);
    audio = new AudioContext();
    await audio.resume().catch(() => {});
    const mix = audio.createMediaStreamDestination();
    // Once routed here the videos' sound reaches only the recording, never the speakers.
    for (const v of [game, face]) audio.createMediaElementSource(v).connect(mix);
    stream = new MediaStream([...cv.captureStream(30).getVideoTracks(), ...mix.stream.getAudioTracks()]);
    // MP4 first: it plays in QuickTime and posts anywhere. Chrome records it since v126; otherwise WebM.
    const type = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
    rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 5_000_000 });
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.start(500);
    await card("Flinch", `${s.tester} playing ${s.build} · ${kept.length} moment${kept.length === 1 ? "" : "s"}`, "#ecebe6", 1500);
    for (const [i, m] of kept.entries()) {
      onProgress(i, kept.length);
      await card(`${timecode(m.t)} · ${KIND_LABEL[m.kind]}`, m.note || (m.kind === "mark" ? "Marked during play" : `Expression change ${m.strength.toFixed(1)}× the tester's normal variation`), COLOR[m.kind], 1000);
      await clip(m);
    }
    onProgress(kept.length, kept.length);
    await wait(200);
    const r = rec;
    await new Promise<void>((done) => (r.state === "inactive" ? done() : ((r.onstop = () => done()), r.stop())));
    if (!chunks.length) throw new Error("the recorder produced no video. Try again with this tab in front.");
    return new Blob(chunks, { type: recordedType(r.mimeType, type) });
  } finally {
    if (rec && rec.state !== "inactive") rec.stop();
    stream?.getTracks().forEach((t) => t.stop());
    void audio?.close().catch(() => {});
    for (const v of [game, face]) {
      v.pause();
      URL.revokeObjectURL(v.src);
      v.removeAttribute("src");
      v.load();
    }
    cv.width = strip.width = 0; // frees the canvas backing memory now, not at the next GC
  }
}
