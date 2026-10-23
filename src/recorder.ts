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

  constructor(private game: MediaStream, private cam: MediaStream) {}

  start() {
    const sources = [
      { stream: this.game, bits: 4_000_000 },
      { stream: this.cam, bits: 1_000_000 },
    ];
    this.recs = sources.map(({ stream, bits }, i) => {
      const rec = new MediaRecorder(new MediaStream(stream.getTracks().filter((t) => t.readyState === "live")), {
        mimeType: this.mimeType || undefined,
        videoBitsPerSecond: bits,
      });
      rec.ondataavailable = (e) => e.data.size && this.chunks[i].push(e.data);
      rec.start(1000);
      return rec;
    });
    this.startedAt = nowMs();
  }

  elapsed(): number {
    return this.startedAt ? (nowMs() - this.startedAt) / 1000 : 0;
  }

  async stop(): Promise<Recording> {
    const duration = this.elapsed();
    await Promise.all(
      this.recs.map((rec) =>
        rec.state === "inactive" ? Promise.resolve() : new Promise<void>((done) => ((rec.onstop = () => done()), rec.stop())),
      ),
    );
    const type = this.mimeType.split(";")[0] || "video/webm";
    return { game: new Blob(this.chunks[0], { type }), face: new Blob(this.chunks[1], { type }), mimeType: type, duration };
  }
}
