import { describe, expect, it } from "vitest";
import { findGaps, within } from "../src/backfill";
import type { Sample } from "../src/types";

const at = (...ts: number[]): Sample[] => ts.map((t) => ({ t, f: 0, d: 0, loud: 0, face: true }));

describe("findGaps", () => {
  it("finds nothing when reads arrive steadily", () => {
    expect(findGaps(at(0.1, 0.2, 0.3, 0.4), 0.5)).toEqual([]);
  });

  it("finds a stretch where the page stalled", () => {
    expect(findGaps(at(0.1, 0.2, 6.2, 6.3), 6.4)).toEqual([[0.2, 6.2]]);
  });

  it("finds gaps at the start and end", () => {
    expect(findGaps(at(2, 2.1), 5)).toEqual([[0, 2], [2.1, 5]]);
  });

  it("treats a session with no reads as one gap", () => {
    expect(findGaps([], 3)).toEqual([[0, 3]]);
  });
});

describe("within", () => {
  it("passes a prompt answer through", async () => {
    await expect(within(Promise.resolve(7), 50, "slow")).resolves.toBe(7);
  });

  it("fails a stuck step instead of waiting forever", async () => {
    await expect(within(new Promise(() => {}), 20, "stuck seek")).rejects.toThrow("stuck seek");
  });
});
