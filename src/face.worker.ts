/// <reference lib="webworker" />
// Runs the face model off the main thread: Chrome slows a page that sits behind the game window, but not this worker.
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { USED } from "./signals";

type Init = { base: string; video: ReadableStream<VideoFrame>; audio?: ReadableStream<AudioData> };

const post = (m: unknown) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);
const now = () => performance.timeOrigin + performance.now();
const FRAME_GAP_MS = 60; // about 15 face reads a second
let running = true;

self.onmessage = async (e: MessageEvent<Init | "stop">) => {
  if (e.data === "stop") {
    running = false;
    return;
  }
  const { base, video, audio } = e.data;
  let landmarker: FaceLandmarker;
  try {
    const files = await FilesetResolver.forVisionTasks(new URL("wasm", base).href, true);
    landmarker = await FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: new URL("models/face_landmarker.task", base).href, delegate: "CPU" },
      runningMode: "VIDEO",
      outputFaceBlendshapes: true,
      numFaces: 2, // so a second person in view is noticed rather than silently read
    });
  } catch (err) {
    post({ type: "error", message: (err as Error)?.message ?? String(err) });
    return;
  }
  post({ type: "ready" });
  if (audio) readAudio(audio);

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
      const r = landmarker.detectForVideo(frame, performance.now());
      const i = largestFace(r.faceLandmarks);
      const cats = i < 0 ? undefined : r.faceBlendshapes?.[i]?.categories;
      const shapes = cats ? Object.fromEntries(cats.filter((c) => USED.includes(c.categoryName)).map((c) => [c.categoryName, c.score])) : null;
      post({ type: "face", at, shapes, faces: r.faceLandmarks.length });
    } catch (err) {
      post({ type: "face", at, shapes: null, faces: 0 });
    } finally {
      frame.close();
    }
  }
  reader.cancel().catch(() => {});
  landmarker.close();
};

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
