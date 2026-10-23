/**
 * Finds the reaction moments in a session's samples. Pure: unit-tested in test/moments.test.ts.
 * The numbers here are starting points, to be tuned on real playtests.
 */
import { uid } from "./format";
import type { Moment, Sample } from "./types";

/** A score must stay this many "spreads" above the tester's resting face to count as a reaction. */
export const THRESHOLD = 2.5;
export const MIN_SECONDS = 0.5; // shorter blips are noise
export const MERGE_SECONDS = 5; // reactions closer than this become one moment
export const MAX_MOMENTS = 12;
export const LOUD_Z = 3; // a groan or laugh this loud near the peak...
export const LOUD_BOOST = 1.5; // ...makes the moment this much stronger

type Candidate = { t: number; kind: "frustration" | "delight"; strength: number };

function runs(samples: Sample[], key: "f" | "d"): Candidate[] {
  const out: Candidate[] = [];
  let start: Sample | null = null;
  let peak: Sample | null = null;
  let prev: Sample | null = null;
  const close = (end: Sample) => {
    if (start && peak && end.t - start.t >= MIN_SECONDS) {
      const loud = samples.some((s) => s.t >= start!.t - 0.5 && s.t <= end.t + 0.5 && s.loud >= LOUD_Z);
      out.push({ t: peak.t, kind: key === "f" ? "frustration" : "delight", strength: round(peak[key] * (loud ? LOUD_BOOST : 1)) });
    }
    start = peak = null;
  };
  for (const s of samples) {
    const gap = prev && s.t - prev.t > 0.6;
    if (start && (gap || !s.face || s[key] < THRESHOLD)) close(prev!);
    if (s.face && s[key] >= THRESHOLD) {
      start ??= s;
      if (!peak || s[key] > peak[key]) peak = s;
    }
    prev = s;
  }
  if (start && prev) close(prev);
  return out;
}

export function findMoments(samples: Sample[], marks: number[] = []): Moment[] {
  const merged: Candidate[] = [];
  for (const c of [...runs(samples, "f"), ...runs(samples, "d")].sort((a, b) => a.t - b.t)) {
    const last = merged[merged.length - 1];
    if (last && c.t - last.t < MERGE_SECONDS) {
      if (c.strength > last.strength) merged[merged.length - 1] = c;
    } else merged.push(c);
  }
  const auto = merged.sort((a, b) => b.strength - a.strength).slice(0, MAX_MOMENTS);
  return [
    ...auto.map((c) => ({ id: uid(), t: c.t, kind: c.kind, strength: c.strength, note: "", dismissed: false })),
    ...marks.map((t) => ({ id: uid(), t: round(t), kind: "mark" as const, strength: 0, note: "", dismissed: false })),
  ].sort((a, b) => a.t - b.t);
}

const round = (v: number) => Math.round(v * 100) / 100;
