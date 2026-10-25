/// <reference lib="webworker" />
// Runs the face model off the main thread: Chrome slows a page that sits behind the game window, but not this worker.
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { USED } from "./signals";

type Init =
  | { base: string; tracks?: false; backfill?: false; video: ReadableStream<VideoFrame>; audio?: ReadableStream<AudioData> }
  | { base: string; tracks: true; backfill?: false; video: MediaStreamTrack; audio?: MediaStreamTrack }
  | { base: string; backfill: true }
  | { frame: ImageBitmap; at: number };

const post = (m: unknown) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);
const now = () => performance.timeOrigin + performance.now();
const FRAME_GAP_MS = 60; // about 15 face reads a second
let running = true;
let owned: MediaStreamTrack[] = [];
let base = "";
let landmarker: FaceLandmarker | null = null;

self.onmessage = async (e: MessageEvent<Init | "stop">) => {
  if (e.data === "stop") {
    running = false;
    owned.forEach((t) => t.stop());
    return;
  }
  const init = e.data;
  // Backfill mode: single frames from the face recording, read after Stop to fill gaps in the live reads.
  if ("frame" in init) {
    post(read(landmarker!, init.frame, init.at));
    init.frame.close();
    return;
  }
  if (init.backfill) {
    base = init.base;
    landmarker = await loadModel();
    if (landmarker) post({ type: "ready" });
    return;
  }
  if (init.tracks) {
    owned = init.audio ? [init.video, init.audio] : [init.video];
    // This worker can't read tracks itself: give them back and ask for streams instead.
    if (typeof MediaStreamTrackProcessor === "undefined") {
      owned.forEach((t) => t.stop());
      owned = [];
      post({ type: "need-streams" });
      return;
    }
  }
  if (!landmarker) {
    base = init.base;
    landmarker = await loadModel();
    if (!landmarker) return;
    post({ type: "ready" });
  }
  const video = init.tracks ? new MediaStreamTrackProcessor({ track: init.video, maxBufferSize: 2 }).readable : init.video;
  const audio = init.tracks
    ? init.audio && (new MediaStreamTrackProcessor({ track: init.audio }).readable as unknown as ReadableStream<AudioData>)
    : init.audio;
  await readFrames(landmarker, video, audio);
};

async function loadModel(): Promise<FaceLandmarker | null> {
  try {
    const files = await FilesetResolver.forVisionTasks(new URL("wasm", base).href, true);
    return await FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: new URL("models/face_landmarker.task", base).href, delegate: "CPU" },
      runningMode: "VIDEO",
      outputFaceBlendshapes: true,
      numFaces: 2, // so a second person in view is noticed rather than silently read
    });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : "The face model failed to load." });
    return null;
  }
}

async function readFrames(landmarker: FaceLandmarker, video: ReadableStream<VideoFrame>, audio?: ReadableStream<AudioData>) {
  // Losing the mic stream only loses the loudness boost; the face reads carry on.
  if (audio) readAudio(audio).catch(() => {});

  const reader = video.getReader();
  let last = 0;
  while (running) {
    const { value: frame, done } = await reader.read();
    if (done) break;
    const at = now();
    if (at - last < FRAME_GAP_MS) {
      frame.close();
      continue;
    }
    last = at;
    try {
      post(read(landmarker, frame, at));
    } finally {
      frame.close();
    }
  }
  reader.cancel().catch(() => {});
  landmarker.close();
};

function read(landmarker: FaceLandmarker, frame: VideoFrame | ImageBitmap, at: number) {
  try {
    const r = landmarker.detectForVideo(frame, performance.now());
    const i = largestFace(r.faceLandmarks);
    const cats = i < 0 ? undefined : r.faceBlendshapes?.[i]?.categories;
    const shapes = cats ? Object.fromEntries(cats.filter((c) => USED.includes(c.categoryName)).map((c) => [c.categoryName, c.score])) : null;
    return { type: "face", at, shapes, faces: r.faceLandmarks.length };
  } catch {
    return { type: "face", at, shapes: null, faces: 0 };
  }
}

/** The tester is the face nearest the camera: the one with the biggest landmark box. */
function largestFace(faces: { x: number; y: number }[][]): number {
  let best = -1, bestArea = 0;
  faces.forEach((pts, i) => {
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (area > bestArea) [best, bestArea] = [i, area];
  });
  return best;
}

/** Mic loudness (root-mean-square level), reported as the loudest chunk of each ~66 ms window. */
async function readAudio(stream: ReadableStream<AudioData>) {
  const reader = stream.getReader();
  let peak = 0;
  let windowStart = now();
  let buf = new Float32Array(0);
  while (running) {
    const { value: data, done } = await reader.read();
    if (done) break;
    try {
      if (buf.length < data.numberOfFrames) buf = new Float32Array(data.numberOfFrames);
      data.copyTo(buf, { planeIndex: 0, format: "f32-planar" });
      let sum = 0;
      for (let i = 0; i < data.numberOfFrames; i++) sum += buf[i] * buf[i];
      peak = Math.max(peak, Math.sqrt(sum / data.numberOfFrames));
    } catch {
      // Unusual sample formats: skip loudness rather than stop the face reader.
    } finally {
      data.close();
    }
    const at = now();
    if (at - windowStart >= 66) {
      post({ type: "loud", at, rms: peak });
      peak = 0;
      windowStart = at;
    }
  }
  reader.cancel().catch(() => {});
}
