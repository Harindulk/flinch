import { describe, expect, it } from "vitest";
import { notesMarkdown } from "../src/export";
import type { Session } from "../src/types";

const base: Session = {
  id: "s1", tester: "Kasun", build: "Drive Away 0.9", createdAt: Date.UTC(2026, 9, 24, 8, 30), duration: 151,
  mimeType: "video/webm", samples: [],
  moments: [
    { id: "a", t: 42.3, kind: "frustration", strength: 6.14, note: "jump too far | again", dismissed: false },
    { id: "b", t: 70, kind: "delight", strength: 8, note: "", dismissed: true },
    { id: "c", t: 95, kind: "mark", strength: 0, note: "boss\n  intro", dismissed: false },
  ],
};

describe("notesMarkdown", () => {
  const md = notesMarkdown(base);

  it("lists kept moments with timecode, reaction, strength and note", () => {
    expect(md).toContain("# Flinch playtest: Kasun · Drive Away 0.9");
    expect(md).toContain("2:31 long · 2 moments");
    expect(md).toContain("| 0:42 | Possible frustration | 6.1× | jump too far \\| again |");
    expect(md).toContain("| 1:35 | Your mark | — | boss intro |");
  });

  it("says what is measured, without claiming feelings", () => {
    expect(md).toContain("facial-expression changes");
    expect(md).not.toMatch(/\| (Frustration|Delight) \|/);
  });

  it("leaves out dismissed moments", () => {
    expect(md).not.toContain("1:10");
  });

  it("says so when nothing was pinned", () => {
    expect(notesMarkdown({ ...base, moments: [] })).toContain("No moments were pinned");
  });
});
