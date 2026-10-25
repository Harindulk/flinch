import type { Shapes } from "./signals";

type Msg =
  | { type: "ready" }
  | { type: "error"; message: string }
  | { type: "need-streams" }
  | { type: "face"; at: number; shapes: Shapes | null; faces: number }
  | { type: "loud"; at: number; rms: number };

/** Starts the face worker on the camera's video and audio tracks. */
export class FaceReader {
  /** Called for each face read: absolute time (ms), the nearest face's blendshapes (null when none), recent mic loudness, faces in view. */
  onFace: (at: number, shapes: Shapes | null, loud: number, faces: number) => void = () => {};
  /** Called if the worker dies after starting (recording carries on without face reads). */
  onCrash: (message: string) => void = () => {};
  private worker = new Worker(new URL("./face.worker.ts", import.meta.url), { type: "module" });
  private loud: { at: number; rms: number }[] = [];

  private constructor() {}

  static start(cam: MediaStream): Promise<FaceReader> {
    const reader = new FaceReader();
    const mic = cam.getAudioTracks()[0];
    // Fallback: frames read on this page and streamed to the worker. They stall whenever this page stalls.
    const sendStreams = () => {
      const video = new MediaStreamTrackProcessor({ track: cam.getVideoTracks()[0], maxBufferSize: 2 }).readable;
      // TypeScript only types the video form; for an audio track the stream carries AudioData.
      const audio = mic ? (new MediaStreamTrackProcessor({ track: mic }).readable as unknown as ReadableStream<AudioData>) : undefined;
      reader.worker.postMessage({ base: document.baseURI, video, audio }, audio ? [video, audio] : [video]);
    };
    // Preferred: hand copies of the camera and mic tracks to the worker, so frames never pass through
    // this page. A busy or background page then can't starve the face reader.
    const sendTracks = () => {
      const video = cam.getVideoTracks()[0].clone();
      const audio = mic?.clone();
      try {
        reader.worker.postMessage({ base: document.baseURI, tracks: true, video, audio }, audio ? [video, audio] : [video]);
      } catch {
        video.stop();
        audio?.stop();
        sendStreams();
      }
    };
    return new Promise((resolve, rejectStart) => {
      const reject = (err: Error) => {
        reader.worker.terminate();
        rejectStart(err);
      };
      let started = false;
      reader.worker.onerror = (e) => {
        const message = e.message || "The face reader stopped unexpectedly.";
        if (started) reader.onCrash(message);
        else reject(new Error(message));
      };
      reader.worker.onmessage = (e: MessageEvent<Msg>) => {
        const m = e.data;
        if (m.type === "ready") {
          started = true;
          resolve(reader);
        }
        else if (m.type === "error") reject(new Error(m.message));
        else if (m.type === "need-streams") sendStreams();
        else if (m.type === "loud") {
          reader.loud.push(m);
          if (reader.loud.length > 30) reader.loud.shift();
        } else if (m.type === "face") reader.onFace(m.at, m.shapes, reader.loudAround(m.at), m.faces);
      };
      sendTracks();
    });
  }

  /**
   * A worker that reads single frames on request: used after Stop to fill stretches where live
   * reads went missing (a busy or background page can starve the live reader).
   */
  static async backfill(): Promise<{ read: (frame: ImageBitmap, at: number) => Promise<{ shapes: Shapes | null; faces: number }>; stop: () => void }> {
    const worker = new Worker(new URL("./face.worker.ts", import.meta.url), { type: "module" });
    let pending: ((m: Msg) => void) | null = null;
    await new Promise<void>((resolve, reject) => {
      worker.onerror = (e) => reject(new Error(e.message || "The face reader failed to start."));
      worker.onmessage = (e: MessageEvent<Msg>) => {
        if (e.data.type === "ready") resolve();
        else if (e.data.type === "error") reject(new Error(e.data.message));
        else pending?.(e.data);
      };
      worker.postMessage({ base: document.baseURI, backfill: true });
    });
    return {
      read: (frame, at) =>
        new Promise((resolve) => {
          pending = (m) => m.type === "face" && resolve({ shapes: m.shapes, faces: m.faces });
          worker.postMessage({ frame, at }, [frame]);
        }),
      stop: () => worker.terminate(),
    };
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
