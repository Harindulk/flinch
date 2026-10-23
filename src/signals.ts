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

// The resting level drifts toward the current face: ~20 s to adopt a new normal (15 reads a second),
// five times slower while the score is high, so a long reaction isn't absorbed straight away.
const DRIFT = 1 / 300;
const DRIFT_HIGH = 1 / 1500;
const HIGH = 2.5;

/**
 * Scores each face read against the tester's resting face. Smooths over time so one noisy frame
 * doesn't spike, and lets the resting level drift so minutes of concentrated frowning become
 * the new normal while sudden reactions still stand out.
 */
export class Scorer {
  private last: Raw | null = null;
  private rest: { f: number; d: number };
  constructor(private base: Baseline, private alpha = 0.4) {
    this.rest = { f: base.f.mean, d: base.d.mean };
  }

  push(raw: Raw): Raw {
    const zf = zScore(raw.f, { mean: this.rest.f, sd: this.base.f.sd });
    const zd = zScore(raw.d, { mean: this.rest.d, sd: this.base.d.sd });
    this.rest.f += (raw.f - this.rest.f) * (zf > HIGH ? DRIFT_HIGH : DRIFT);
    this.rest.d += (raw.d - this.rest.d) * (zd > HIGH ? DRIFT_HIGH : DRIFT);
    const z = { f: clip(zf), d: clip(zd), loud: clip(zScore(raw.loud, this.base.loud)) };
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
