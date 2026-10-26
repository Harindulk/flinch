import { describe, expect, it } from "vitest";
import { calibrate, rawSignals, Scorer, SD_FLOOR, zScore } from "../src/signals";

const neutral = { browDownLeft: 0.05, browDownRight: 0.05, mouthSmileLeft: 0.02, mouthSmileRight: 0.02 };
const smiling = { ...neutral, mouthSmileLeft: 0.9, mouthSmileRight: 0.85, cheekSquintLeft: 0.5, cheekSquintRight: 0.5 };
const frowning = { ...neutral, browDownLeft: 0.7, browDownRight: 0.65, mouthPressLeft: 0.5, mouthPressRight: 0.5 };

describe("rawSignals", () => {
  it("reads a smile as delight, not frustration", () => {
    const s = rawSignals(smiling);
    expect(s.d).toBeGreaterThan(0.6);
    expect(s.f).toBeLessThanOrEqual(rawSignals(neutral).f);
  });

  it("reads lowered brows and pressed lips as frustration", () => {
    expect(rawSignals(frowning).f).toBeGreaterThan(rawSignals(neutral).f + 0.2);
  });

  it("damps frustration during a big grin, since grins squint the eyes too", () => {
    const grin = { ...smiling, eyeSquintLeft: 0.6, eyeSquintRight: 0.6, noseSneerLeft: 0.3, noseSneerRight: 0.3 };
    const squintOnly = { ...neutral, eyeSquintLeft: 0.6, eyeSquintRight: 0.6, noseSneerLeft: 0.3, noseSneerRight: 0.3 };
    expect(rawSignals(grin).f).toBeLessThan(rawSignals(squintOnly).f * 0.6);
  });

  it("treats missing blendshapes as zero", () => {
    expect(rawSignals({})).toEqual({ f: 0, d: 0 });
  });
});

describe("calibrate", () => {
  it("floors the spread so a perfectly still face doesn't make twitches look huge", () => {
    const b = calibrate(Array(50).fill({ f: 0.1, d: 0.02, loud: 0.01 }));
    expect(b.f.mean).toBeCloseTo(0.1);
    expect(b.f.sd).toBe(SD_FLOOR.f);
    expect(b.loud.sd).toBe(SD_FLOOR.loud);
  });

  it("isn't thrown off by a laugh during calibration, so later smiles still stand out", () => {
    const rest = { ...rawSignals(neutral), loud: 0.01 };
    const laugh = { ...rawSignals(smiling), loud: 0.3 };
    const b = calibrate(Array.from({ length: 150 }, (_, i) => (i >= 60 && i < 75 ? laugh : rest)));
    expect(b.d.mean).toBeCloseTo(rest.d);
    expect(b.d.sd).toBe(SD_FLOOR.d);
    expect(zScore(rawSignals(smiling).d, b.d)).toBeGreaterThan(10);
    expect(zScore(0.3, b.loud)).toBeGreaterThan(10);
  });

  it("copes with an empty or tiny calibration", () => {
    expect(calibrate([]).f).toEqual({ mean: 0, sd: SD_FLOOR.f });
    expect(calibrate([{ f: 0.1, d: 0.2, loud: 0 }, { f: 0.3, d: 0.2, loud: 0 }]).f.mean).toBeCloseTo(0.2);
  });

  it("learns a frowny resting face, so the same frown later scores as normal", () => {
    const frowny = rawSignals(frowning);
    const b = calibrate(Array(50).fill({ ...frowny, loud: 0 }));
    expect(Math.abs(zScore(frowny.f, b.f))).toBeLessThan(0.01);
  });
});

describe("Scorer", () => {
  const base = calibrate(Array.from({ length: 100 }, (_, i) => ({ ...rawSignals(neutral), loud: 0.01 + (i % 2) * 0.004 })));

  it("rises well above the pin threshold when the tester smiles", () => {
    const sc = new Scorer(base);
    let last = sc.push({ ...rawSignals(neutral), loud: 0.01 });
    expect(last.d).toBeLessThan(1);
    for (let i = 0; i < 8; i++) last = sc.push({ ...rawSignals(smiling), loud: 0.01 });
    expect(last.d).toBeGreaterThan(5);
    expect(last.f).toBeLessThan(1);
  });

  it("smooths one noisy frame", () => {
    const sc = new Scorer(base);
    for (let i = 0; i < 5; i++) sc.push({ ...rawSignals(neutral), loud: 0.01 });
    const spike = sc.push({ ...rawSignals(smiling), loud: 0.01 });
    const back = sc.push({ ...rawSignals(neutral), loud: 0.01 });
    expect(back.d).toBeLessThan(spike.d);
  });

  it("adopts minutes of concentrated frowning as the new normal, but still catches a sharp frown", () => {
    const sc = new Scorer(base);
    const concentrating = { ...neutral, browDownLeft: 0.3, browDownRight: 0.3 };
    const first = sc.push({ ...rawSignals(concentrating), loud: 0.01 });
    expect(first.f).toBeGreaterThan(2.5);
    let last = first;
    for (let i = 0; i < 15 * 90; i++) last = sc.push({ ...rawSignals(concentrating), loud: 0.01 });
    expect(last.f).toBeLessThan(2.5);
    for (let i = 0; i < 10; i++) last = sc.push({ ...rawSignals(frowning), loud: 0.01 });
    expect(last.f).toBeGreaterThan(5);
  });

  it("marks a loud groan", () => {
    const sc = new Scorer(base);
    expect(sc.push({ ...rawSignals(neutral), loud: 0.3 }).loud).toBeGreaterThan(5);
  });
});
