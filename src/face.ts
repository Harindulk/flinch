import type { Shapes } from "./signals";

type Msg =
  | { type: "ready" }
  | { type: "error"; message: string }
  | { type: "face"; at: number; shapes: Shapes | null }
  | { type: "loud"; at: number; rms: number };

/** Starts the face worker on the camera's video and audio tracks. */
export class FaceReader {
  /** Called for each face read: absolute time (ms), the blendshapes or null when no face, and recent mic loudness. */
  onFace: (at: number, shapes: Shapes | null, loud: number) => void = () => {};
  private worker = new Worker(new URL("./face.worker.ts", import.meta.url), { type: "module" });
  private loud: { at: number; rms: number }[] = [];

  private constructor() {}

  static start(cam: MediaStream): Promise<FaceReader> {
    const reader = new FaceReader();
    const video = new MediaStreamTrackProcessor({ track: cam.getVideoTracks()[0], maxBufferSize: 2 }).readable;
    const mic = cam.getAudioTracks()[0];
    // TypeScript only types the video form; for an audio track the stream carries AudioData.
    const audio = mic ? (new MediaStreamTrackProcessor({ track: mic }).readable as unknown as ReadableStream<AudioData>) : undefined;
    return new Promise((resolve, reject) => {
      reader.worker.onerror = (e) => reject(new Error(e.message || "The face reader failed to start."));
      reader.worker.onmessage = (e: MessageEvent<Msg>) => {
        const m = e.data;
        if (m.type === "ready") resolve(reader);
        else if (m.type === "error") reject(new Error(m.message));
        else if (m.type === "loud") {
          reader.loud.push(m);
          if (reader.loud.length > 30) reader.loud.shift();
        } else if (m.type === "face") reader.onFace(m.at, m.shapes, reader.loudAround(m.at));
      };
      reader.worker.postMessage({ base: document.baseURI, video, audio }, audio ? [video, audio] : [video]);
    });
  }

  private loudAround(at: number): number {
    let max = 0;
    for (const l of this.loud) if (l.at > at - 200 && l.at <= at + 50) max = Math.max(max, l.rms);
    return max;
  }

  stop() {
    this.worker.postMessage("stop");
    setTimeout(() => this.worker.terminate(), 500);
  }
}
