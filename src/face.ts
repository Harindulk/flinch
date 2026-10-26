import type { Shapes } from "./signals";

type Msg =
  | { type: "ready" }
  | { type: "error"; message: string }
  | { type: "face"; at: number; shapes: Shapes | null; faces: number }
  | { type: "loud"; at: number; rms: number };

// What the worker downloads before it can read a face (about 17 MB). Same URLs the worker uses, so a warm-up fills the HTTP cache.
const MODEL_FILES = ["wasm/vision_wasm_module_internal.js", "wasm/vision_wasm_module_internal.wasm", "models/face_landmarker.task"];
let warmed = false;

/**
 * Downloads the face reader's files in the background while the visitor reads, so pressing
 * Calibrate doesn't wait on 17 MB. Skipped on data-saver connections; failures are harmless.
 */
export function warmFaceModel() {
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  if (warmed || saveData) return;
  warmed = true;
  const go = async () => {
    for (const f of MODEL_FILES) await fetch(new URL(f, document.baseURI)).then((r) => r.arrayBuffer()).catch(() => {});
  };
  if ("requestIdleCallback" in window) requestIdleCallback(() => void go(), { timeout: 4000 });
  else setTimeout(() => void go(), 2000);
}

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
    // Frames pass through this page on the way to the worker (Chrome can't hand the worker a camera
    // track yet), so a stalled page starves the live reads; src/backfill.ts fills those gaps after Stop.
    const sendStreams = () => {
      const video = new MediaStreamTrackProcessor({ track: cam.getVideoTracks()[0], maxBufferSize: 2 }).readable;
      // TypeScript only types the video form; for an audio track the stream carries AudioData.
      const audio = mic ? (new MediaStreamTrackProcessor({ track: mic }).readable as unknown as ReadableStream<AudioData>) : undefined;
      reader.worker.postMessage({ base: document.baseURI, video, audio }, audio ? [video, audio] : [video]);
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
        else if (m.type === "loud") {
          reader.loud.push(m);
          if (reader.loud.length > 30) reader.loud.shift();
        } else if (m.type === "face") reader.onFace(m.at, m.shapes, reader.loudAround(m.at), m.faces);
      };
      sendStreams();
    });
  }

  /**
   * A worker that reads single frames on request: used after Stop to fill stretches where live
   * reads went missing (a busy or background page can starve the live reader).
   */
  static async backfill(): Promise<{ read: (frame: ImageBitmap, at: number) => Promise<{ shapes: Shapes | null; faces: number }>; stop: () => void }> {
    const worker = new Worker(new URL("./face.worker.ts", import.meta.url), { type: "module" });
    // The read in flight. A crashed or stuck worker must fail it, or Stop would wait forever and never save.
    let pending: { resolve: (m: Msg) => void; reject: (e: Error) => void } | null = null;
    const fail = (message: string) => {
      worker.terminate();
      pending?.reject(new Error(message));
      pending = null;
    };
    await new Promise<void>((resolve, rejectStart) => {
      // The model is already cached from the live reader, so a slow start means it's stuck: give up and save without the fill.
      const timer = setTimeout(() => reject(new Error("The face reader took too long to start.")), 20000);
      const reject = (err: Error) => {
        clearTimeout(timer);
        worker.terminate();
        rejectStart(err);
      };
      worker.onerror = (e) => {
        reject(new Error(e.message || "The face reader failed to start."));
        fail(e.message || "The face reader stopped.");
      };
      worker.onmessage = (e: MessageEvent<Msg>) => {
        if (e.data.type === "ready") {
          clearTimeout(timer);
          resolve();
        } else if (e.data.type === "error") reject(new Error(e.data.message));
        else if (e.data.type === "face") pending?.resolve(e.data);
      };
      worker.postMessage({ base: document.baseURI, backfill: true });
    });
    return {
      read: (frame, at) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => fail("The face reader stopped answering."), 5000);
          pending = {
            resolve: (m) => {
              clearTimeout(timer);
              if (m.type === "face") resolve({ shapes: m.shapes, faces: m.faces });
            },
            reject: (e) => {
              clearTimeout(timer);
              reject(e);
            },
          };
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
