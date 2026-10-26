/**
 * Live face reads can go missing when the page is busy or sits behind the game. The face recording
 * is always complete, so after Stop the missing stretches are read from it instead.
 */
import { h } from "./dom";
import { FaceReader } from "./face";
import { loadVideo, seekTo } from "./player";
import { rawSignals, Scorer, type Baseline } from "./signals";
import type { Sample } from "./types";

export const GAP_S = 0.6; // live reads arrive ~15 times a second; a longer silence is a gap
export const FILL_FPS = 10;
export const MAX_FILL_S = 300; // shortcut: past five minutes of gaps, leave the rest rather than keep the tester waiting
export const MAX_FILL_MS = 120_000; // and never spend more than two minutes of wall time on it
const SEEK_MS = 4000;

/** Rejects if `p` hasn't settled within `ms`, so a stuck video seek can't hold up saving. */
export const within = <T>(p: Promise<T>, ms: number, message: string) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    p.then(resolve, reject).finally(() => clearTimeout(timer));
  });

/** Stretches with no live face read, including before the first and after the last. Pure: unit-tested. */
export function findGaps(samples: Sample[], duration: number): [number, number][] {
  const gaps: [number, number][] = [];
  let prev = 0;
  for (const s of samples) {
    if (s.t - prev > GAP_S) gaps.push([prev, s.t]);
    prev = Math.max(prev, s.t);
  }
  if (duration - prev > GAP_S) gaps.push([prev, duration]);
  return gaps;
}

/** Reads the gaps from the face recording and adds the samples in place. Returns seconds filled. */
export async function fillGaps(samples: Sample[], face: Blob, duration: number, baseline: Baseline, onProgress: (frac: number) => void): Promise<number> {
  const gaps = findGaps(samples, duration);
  let total = gaps.reduce((n, [a, b]) => n + (b - a), 0);
  if (!gaps.length) return 0;
  total = Math.min(total, MAX_FILL_S);
  const video = h("video", { muted: true, playsInline: true });
  const reader = await FaceReader.backfill();
  let done = 0;
  const deadline = performance.now() + MAX_FILL_MS;
  try {
    await loadVideo(video, face);
    const end = Math.min(duration, video.duration || duration);
    for (const [from, to] of gaps) {
      const scorer = new Scorer(baseline);
      for (let t = from + 1 / FILL_FPS; t < Math.min(to, end) && done < total && performance.now() < deadline; t += 1 / FILL_FPS) {
        await within(seekTo(video, t), SEEK_MS, "The face recording stopped seeking.");
        const { shapes } = await reader.read(await createImageBitmap(video), t);
        if (!shapes) {
          scorer.reset();
          samples.push({ t: round(t), f: 0, d: 0, loud: 0, face: false });
        } else {
          const s = scorer.push({ ...rawSignals(shapes), loud: 0 });
          samples.push({ t: round(t), f: round(s.f), d: round(s.d), loud: 0, face: true, filled: true });
        }
        done += 1 / FILL_FPS;
        onProgress(Math.min(1, done / total));
      }
    }
  } finally {
    samples.sort((a, b) => a.t - b.t); // also after a failed fill: everything downstream assumes time order
    reader.stop();
    URL.revokeObjectURL(video.src);
    video.removeAttribute("src");
    video.load();
  }
  return done;
}

const round = (v: number) => Math.round(v * 100) / 100;
