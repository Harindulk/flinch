/** 83.4 → "1:23" */
export function timecode(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** Absolute wall-clock milliseconds, comparable between the page and its workers. */
export const nowMs = () => performance.timeOrigin + performance.now();

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "playtest";
}
