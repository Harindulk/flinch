import { describe, expect, it } from "vitest";
import { compareText, stats } from "../src/compare";
import type { Moment, Session } from "../src/types";

const m = (kind: Moment["kind"], dismissed = false): Moment => ({ id: Math.random().toString(), t: 1, kind, strength: 5, note: "", dismissed });
const session = (moments: Moment[], peakF: number, peakD = 1): Session => ({
  id: "s", tester: "Kasun", build: "0.9", createdAt: 0, duration: 120, mimeType: "video/webm", moments,
  samples: [{ t: 0, f: 0.2, d: 0.1, loud: 0, face: true }, { t: 1, f: peakF, d: peakD, loud: 0, face: true }, { t: 2, f: 99, d: 99, loud: 0, face: false }],
});

describe("stats", () => {
  it("counts kept moments by kind and ignores samples with no face", () => {
    const s = stats(session([m("frustration"), m("frustration", true), m("delight"), m("mark")], 6.14));
    expect(s).toEqual({ frustrations: 1, delights: 1, peakF: 6.1, peakD: 1, duration: 120 });
  });
});

describe("compareText", () => {
  const before = stats(session([m("frustration"), m("frustration"), m("frustration")], 8.2));
  it("says a fix worked when frustration pins drop and get no stronger", () => {
    const now = stats(session([m("frustration")], 6.0, 7));
    const t = compareText(now, before, "Drive Away 0.9");
    expect(t.now).toBe("1 possible frustration, strongest 6.0× · 0 possible delights");
    expect(t.before).toBe("3 possible frustrations, strongest 8.2× · 0 possible delights");
    expect(t.verdict).toBe("Fewer frustration pins than Drive Away 0.9, and no stronger.");
  });
  it("flags a build that got worse", () => {
    expect(compareText(stats(session([m("frustration"), m("frustration"), m("frustration"), m("frustration")], 9)), before, "0.9").verdict).toMatch(/More or stronger/);
  });
  it("calls an unchanged build the same, and notices extra delight", () => {
    expect(compareText(stats(session([m("frustration"), m("frustration"), m("frustration"), m("delight")], 8.0)), before, "0.9").verdict).toBe("About the same frustration as 0.9. More delight too.");
  });
});
