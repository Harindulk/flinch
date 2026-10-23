import { describe, expect, it } from "vitest";
import { findMoments, MAX_MOMENTS, THRESHOLD } from "../src/moments";
import type { Sample } from "../src/types";

/** 15 samples a second; `at` maps a time to {f, d, loud} overrides. */
function session(seconds: number, at: (t: number) => Partial<Sample> = () => ({})): Sample[] {
  return Array.from({ length: Math.round(seconds * 15) }, (_, i) => {
    const t = i / 15;
    return { t, f: 0.2, d: 0.1, loud: 0, face: true, ...at(t) };
  });
}

describe("findMoments", () => {
  it("finds nothing in a calm session", () => {
    expect(findMoments(session(60))).toEqual([]);
  });

  it("pins a sustained frown at its peak", () => {
    const m = findMoments(session(30, (t) => (t >= 10 && t < 12 ? { f: t < 11 ? 4 : 6 } : {})));
    expect(m).toHaveLength(1);
    expect(m[0].kind).toBe("frustration");
    expect(m[0].t).toBeGreaterThanOrEqual(11);
    expect(m[0].strength).toBe(6);
  });

  it("ignores a blip shorter than half a second", () => {
    expect(findMoments(session(30, (t) => (t >= 10 && t < 10.3 ? { d: 9 } : {})))).toEqual([]);
  });

  it("ignores a score that only reaches the threshold while the face is missing", () => {
    expect(findMoments(session(30, (t) => (t >= 10 && t < 12 ? { d: 9, face: false } : {})))).toEqual([]);
  });

  it("merges reactions closer than five seconds, keeping the stronger", () => {
    const m = findMoments(session(40, (t) => (t >= 10 && t < 11 ? { f: 4 } : t >= 13 && t < 14 ? { d: 7 } : {})));
    expect(m).toHaveLength(1);
    expect(m[0].kind).toBe("delight");
  });

  it("boosts a reaction when the tester was loud", () => {
    const quiet = findMoments(session(30, (t) => (t >= 10 && t < 11 ? { f: 4 } : {})));
    const loud = findMoments(session(30, (t) => (t >= 10 && t < 11 ? { f: 4, loud: t < 10.2 ? 6 : 0 } : {})));
    expect(loud[0].strength).toBeGreaterThan(quiet[0].strength);
  });

  it("keeps only the strongest twelve, in time order", () => {
    const m = findMoments(session(300, (t) => (Math.floor(t) % 10 === 0 ? { d: THRESHOLD + 1 + t / 100 } : {})));
    expect(m).toHaveLength(MAX_MOMENTS);
    expect(m.map((x) => x.t)).toEqual([...m.map((x) => x.t)].sort((a, b) => a - b));
    expect(Math.min(...m.map((x) => x.t))).toBeGreaterThan(150); // the later, stronger ones won
  });

  it("always includes manual marks", () => {
    const m = findMoments(session(30), [5, 20.25]);
    expect(m.map((x) => [x.kind, x.t])).toEqual([["mark", 5], ["mark", 20.25]]);
  });
});
