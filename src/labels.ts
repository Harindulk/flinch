/**
 * The words Flinch uses for what it measures. These are facial-expression changes against the
 * tester's own resting face, not feelings, so every label says "possible".
 */
import type { MomentKind } from "./types";

export const KIND_LABEL: Record<MomentKind, string> = {
  frustration: "Possible frustration",
  delight: "Possible delight",
  mark: "Your mark",
};

export const SIGNAL_LABEL = { f: "Tension (brows, lips)", d: "Smile" } as const;

export const MEASURE_NOTE =
  "Flinch measures facial-expression changes against the tester's own resting face. A pin says where to look, not what the tester felt.";

/** 6.1 → "Clear change · 6.1×": how far past the tester's normal face-to-face variation it went. */
export function strengthText(strength: number): string {
  const size = strength >= 7 ? "Strong" : strength >= 4 ? "Clear" : "Slight";
  return `${size} change · ${strength.toFixed(1)}×`;
}

export const STRENGTH_TIP = "How far the expression moved, in multiples of the tester's normal variation at rest.";

/** One line on why a pin is there, for the review list. */
export function whyPinned(kind: MomentKind, threshold: number, minSeconds: number): string {
  if (kind === "mark") return "You pressed M here during play.";
  const what = kind === "frustration" ? "Tension in the brows and lips" : "The smile";
  return `${what} stayed above ${threshold}× the tester's resting variation for at least ${minSeconds} s.`;
}
