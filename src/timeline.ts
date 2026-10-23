import { timecode } from "./format";
import type { Moment, Sample } from "./types";

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const KIND_COLOR = { frustration: "--frus", delight: "--joy", mark: "--mark" } as const;
const Y_MAX = 8; // scores above this many spreads draw at the top
const PAD = { top: 18, bottom: 20, x: 10 };

export type TimelineOpts = {
  from: number;
  to: number;
  moments?: Moment[];
  playhead?: number;
  selected?: string | null;
  threshold?: number;
  /** Fixed size for canvases that aren't on the page (the highlight reel). */
  width?: number;
  height?: number;
};

/** Draws the frustration and delight lines (with gaps where there was no face), pins and a playhead. */
export function drawTimeline(cv: HTMLCanvasElement, samples: Sample[], o: TimelineOpts) {
  const dpr = o.width ? 1 : window.devicePixelRatio || 1;
  const w = o.width ?? cv.clientWidth, hgt = o.height ?? cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(hgt * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(hgt * dpr);
  }
  const g = cv.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, hgt);
  if (o.width) {
    g.fillStyle = css("--panel") || "#1a1c20";
    g.fillRect(0, 0, w, hgt);
  }

  const span = Math.max(o.to - o.from, 0.001);
  const x = (t: number) => PAD.x + ((t - o.from) / span) * (w - 2 * PAD.x);
  const y = (z: number) => hgt - PAD.bottom - (Math.max(0, Math.min(z, Y_MAX)) / Y_MAX) * (hgt - PAD.top - PAD.bottom);

  // Rest line and threshold guide.
  g.strokeStyle = css("--line");
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(PAD.x, y(0) + 0.5);
  g.lineTo(w - PAD.x, y(0) + 0.5);
  g.stroke();
  if (o.threshold) {
    g.setLineDash([3, 4]);
    g.beginPath();
    g.moveTo(PAD.x, Math.round(y(o.threshold)) + 0.5);
    g.lineTo(w - PAD.x, Math.round(y(o.threshold)) + 0.5);
    g.stroke();
    g.setLineDash([]);
  }

  // Time ticks.
  const step = [5, 10, 15, 30, 60, 120, 300].find((s) => (span / s) * 60 < w) ?? 600;
  g.fillStyle = css("--muted");
  g.font = `11px ${css("--mono")}`;
  g.textBaseline = "bottom";
  for (let t = Math.ceil(o.from / step) * step; t <= o.to; t += step) if (x(t) < w - 40) g.fillText(timecode(t), x(t) + 3, hgt - 3);

  // Face-lost stretches.
  g.fillStyle = "rgba(255,181,71,0.07)";
  let lostFrom: number | null = null;
  for (const s of samples) {
    if (!s.face && lostFrom === null) lostFrom = s.t;
    if (s.face && lostFrom !== null) {
      g.fillRect(x(lostFrom), PAD.top, x(s.t) - x(lostFrom), hgt - PAD.top - PAD.bottom);
      lostFrom = null;
    }
  }
  if (lostFrom !== null && samples.length) g.fillRect(x(lostFrom), PAD.top, x(samples[samples.length - 1].t) - x(lostFrom), hgt - PAD.top - PAD.bottom);

  // The two lines, broken wherever the face was missing or samples have a gap.
  for (const [key, color] of [["f", "--frus"], ["d", "--joy"]] as const) {
    g.strokeStyle = css(color);
    g.lineWidth = 2;
    g.lineJoin = "round";
    g.beginPath();
    let prev: Sample | null = null;
    for (const s of samples) {
      if (s.t < o.from - 1 || s.t > o.to + 1) continue;
      if (!s.face) {
        prev = null;
        continue;
      }
      if (!prev || s.t - prev.t > 0.6) g.moveTo(x(s.t), y(s[key]));
      else g.lineTo(x(s.t), y(s[key]));
      prev = s;
    }
    g.stroke();
  }

  // Pins.
  for (const m of o.moments ?? []) {
    if (m.t < o.from || m.t > o.to) continue;
    const px = Math.round(x(m.t)) + 0.5;
    const sel = m.id === o.selected;
    g.globalAlpha = m.dismissed ? 0.3 : 1;
    g.strokeStyle = g.fillStyle = css(KIND_COLOR[m.kind]);
    g.lineWidth = sel ? 2 : 1;
    g.beginPath();
    g.moveTo(px, PAD.top - 4);
    g.lineTo(px, hgt - PAD.bottom);
    g.stroke();
    g.beginPath();
    g.moveTo(px - 6, 2);
    g.lineTo(px + 6, 2);
    g.lineTo(px, 12);
    g.closePath();
    g.fill();
    g.globalAlpha = 1;
  }

  if (o.playhead !== undefined) {
    g.strokeStyle = css("--text");
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x(o.playhead), 0);
    g.lineTo(x(o.playhead), hgt);
    g.stroke();
  }
}

/** Inverse of the x mapping above, for click-to-seek. */
export function timeAt(cv: HTMLCanvasElement, clientX: number, from: number, to: number): number {
  const r = cv.getBoundingClientRect();
  const frac = (clientX - r.left - PAD.x) / (r.width - 2 * PAD.x);
  return from + Math.max(0, Math.min(1, frac)) * (to - from);
}
