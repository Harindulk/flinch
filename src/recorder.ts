import { nowMs } from "./format";

export type Recording = { game: Blob; face: Blob; mimeType: string; duration: number };

function pickMime(): string {
  for (const m of ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"])
    if (MediaRecorder.isTypeSupported(m)) return m;
  return "";
}

/**
 * Two native MediaRecorders started together: the game window (with its sound) and the
 * webcam (with the mic). Native recording keeps going while Flinch's tab is behind the game.
 */
export class SessionRecorder {
  startedAt = 0;
  readonly mimeType = pickMime();
  private recs: MediaRecorder[] = [];
  private chunks: Blob[][] = [[], []];
  private stopped: Promise<void>[] = [];
  /** Called if either recorder fails mid-session; the caller should stop and save what exists. */
  onError: (message: string) => void = () => {};

  constructor(private game: MediaStream, private cam: MediaStream) {}

  start() {
    const sources = [
      // shortcut: chunks stay in memory until Stop (~20 MB a minute at these rates); stream them to IndexedDB if sessions grow past ~30 min.
      { stream: this.game, bits: 2_500_000 },
      { stream: this.cam, bits: 1_000_000 },
    ];
    this.recs = sources.map(({ stream, bits }, i) => {
      const rec = new MediaRecorder(new MediaStream(stream.getTracks().filter((t) => t.readyState === "live")), {
        mimeType: this.mimeType || undefined,
        videoBitsPerSecond: bits,
      });
      rec.ondataavailable = (e) => e.data.size && this.chunks[i].push(e.data);
      rec.onerror = () => this.onError("The recorder stopped unexpectedly.");
      // Listen from the start: a recorder that stops on its own (its track ended) still delivers its last chunk before "stop".
      this.stopped.push(new Promise<void>((done) => rec.addEventListener("stop", () => done(), { once: true })));
      rec.start(1000);
      return rec;
    });
    // Both recorders start in the same task, a few ms apart (under one camera frame), so game and face share t = 0.
    this.startedAt = nowMs();
  }

  elapsed(): number {
    return this.startedAt ? (nowMs() - this.startedAt) / 1000 : 0;
  }

  async stop(): Promise<Recording> {
    const duration = this.elapsed();
    for (const rec of this.recs) if (rec.state !== "inactive") rec.stop();
    // Never hang on a recorder that doesn't report back: keep whatever chunks arrived.
    await Promise.race([Promise.all(this.stopped), new Promise((done) => setTimeout(done, 5000))]);
    const type = this.mimeType.split(";")[0] || "video/webm";
    return { game: new Blob(this.chunks[0], { type }), face: new Blob(this.chunks[1], { type }), mimeType: type, duration };
  }
}
