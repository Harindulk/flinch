/**
 * Compares two playtests so a dev can see whether a fix changed the reactions. Pure: unit-tested.
 * shortcut: sessions are lined up by time from the start of recording; aligning by game events
 * (level start, death) would need markers sent from the game.
 */
import { timecode } from "./format";
import { KIND_LABEL } from "./labels";
import type { Session } from "./types";

export type Stats = { frustrations: number; delights: number; peakF: number; peakD: number; duration: number };

export function stats(s: Session): Stats {
  const kept = s.moments.filter((m) => !m.dismissed);
  let peakF = 0, peakD = 0;
  for (const x of s.samples) if (x.face) {
    peakF = Math.max(peakF, x.f);
    peakD = Math.max(peakD, x.d);
  }
  return {
    frustrations: kept.filter((m) => m.kind === "frustration").length,
    delights: kept.filter((m) => m.kind === "delight").length,
    peakF: Math.round(peakF * 10) / 10,
    peakD: Math.round(peakD * 10) / 10,
    duration: s.duration,
  };
}

const n = (k: number, word: string) => `${k} ${word}${k === 1 ? "" : "s"}`;

/** One plain sentence per session, then what changed, in the same careful words as the rest of Flinch. */
export function compareText(now: Stats, before: Stats, beforeName: string): { now: string; before: string; verdict: string } {
  const line = (s: Stats) =>
    `${n(s.frustrations, KIND_LABEL.frustration.toLowerCase())}${s.frustrations ? `, strongest ${s.peakF.toFixed(1)}×` : ""} · ${n(s.delights, KIND_LABEL.delight.toLowerCase())}`;
  const df = now.frustrations - before.frustrations;
  const dp = now.peakF - before.peakF;
  let verdict: string;
  if (!now.frustrations && !before.frustrations) verdict = `No possible frustration pinned in either this playtest or ${beforeName}.`;
  else if (df < 0) verdict = dp <= 0.5 ? `Fewer frustration pins than ${beforeName}, and no stronger.` : `Fewer frustration pins than ${beforeName}, but the strongest change was bigger. Check it.`;
  else if (df > 0 || dp > 1.5) verdict = `More or stronger possible frustration than ${beforeName}. Worth a look before shipping.`;
  else verdict = `About the same possible frustration as ${beforeName}.`;
  if (now.delights > before.delights) verdict += " More possible delight too.";
  else if (now.delights < before.delights) verdict += " Less possible delight than before.";
  // Pin counts only compare fairly between sessions of similar length.
  const [lo, hi] = [now.duration, before.duration].sort((a, b) => a - b);
  if (lo > 0 && hi / lo > 1.5) verdict += ` This playtest was ${now.duration > before.duration ? "longer" : "shorter"} (${timecode(now.duration)} vs ${timecode(before.duration)}), so counts are not like for like.`;
  return { now: line(now), before: line(before), verdict };
}
