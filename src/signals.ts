/**
 * Turns MediaPipe face blendshapes (0–1 scores for 52 facial movements) into two signals,
 * then measures them against this tester's own resting face from calibration.
 * Pure functions: unit-tested in test/signals.test.ts.
 */

export type Shapes = Record<string, number>;
export type Raw = { f: number; d: number; loud: number };
export type Stat = { mean: number; sd: number };
export type Baseline = { f: Stat; d: Stat; loud: Stat };

/** The blendshapes the formulas use; the worker sends only these. */
export const USED = [
  "browDownLeft", "browDownRight", "mouthFrownLeft", "mouthFrownRight", "mouthPressLeft", "mouthPressRight",
  "noseSneerLeft", "noseSneerRight", "eyeSquintLeft", "eyeSquintRight",
  "mouthSmileLeft", "mouthSmileRight", "cheekSquintLeft", "cheekSquintRight",
];

const pair = (s: Shapes, name: string) => ((s[`${name}Left`] ?? 0) + (s[`${name}Right`] ?? 0)) / 2;

/**
 * Frustration: brows pulled down, frown, pressed lips, nose wrinkle, squint. Delight: smile and raised cheeks.
 * A real grin also squints the eyes and wrinkles the nose, so a big smile damps the frustration score.
 */
export function rawSignals(s: Shapes): { f: number; d: number } {
  const smile = pair(s, "mouthSmile");
  const f = 0.35 * pair(s, "browDown") + 0.2 * pair(s, "mouthFrown") + 0.2 * pair(s, "mouthPress") + 0.15 * pair(s, "noseSneer") + 0.1 * pair(s, "eyeSquint");
  return { f: f * (1 - 0.6 * Math.min(1, smile)), d: 0.7 * smile + 0.3 * pair(s, "cheekSquint") };
}

// A perfectly still face during calibration would make tiny twitches look huge; these floors stop that.
export const SD_FLOOR = { f: 0.025, d: 0.025, loud: 0.01 };

function stat(xs: number[], floor: number): Stat {
  const mean = xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length || 1));
  return { mean, sd: Math.max(sd, floor) };
}

export function calibrate(frames: Raw[]): Baseline {
  return {
    f: stat(frames.map((r) => r.f), SD_FLOOR.f),
    d: stat(frames.map((r) => r.d), SD_FLOOR.d),
    loud: stat(frames.map((r) => r.loud), SD_FLOOR.loud),
  };
}

export const zScore = (v: number, s: Stat) => (v - s.mean) / s.sd;
const clip = (v: number) => Math.max(-3, Math.min(12, v));

/** Smooths calibrated scores over time so a single noisy frame doesn't spike. */
export class Scorer {
  private last: Raw | null = null;
  constructor(private base: Baseline, private alpha = 0.4) {}

  push(raw: Raw): Raw {
    const z = { f: clip(zScore(raw.f, this.base.f)), d: clip(zScore(raw.d, this.base.d)), loud: clip(zScore(raw.loud, this.base.loud)) };
    const a = this.alpha;
    this.last = this.last
      ? { f: a * z.f + (1 - a) * this.last.f, d: a * z.d + (1 - a) * this.last.d, loud: Math.max(z.loud, 0.6 * this.last.loud) }
      : z;
    return this.last;
  }

  /** After the face disappears, start fresh rather than blending with stale values. */
  reset() {
    this.last = null;
  }
}
