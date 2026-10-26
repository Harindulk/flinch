import { h } from "../dom";
import { timecode } from "../format";

const SVG = "http://www.w3.org/2000/svg";
const svg = (tag: string, attrs: Record<string, string>) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
// Small steady wobble so the line looks like a resting face, not a ruler. Deterministic: same line every visit.
const wobble = (x: number) => Math.sin(x * 91) * 0.6 + Math.sin(x * 37 + 1.3) * 0.9;
const bump = (x: number, at: number, width: number) => Math.exp(-(((x - at) / width) ** 2));

/** A path across viewBox 0..1000 × 0..H, rising at each spike. */
function line(spikes: number[], H: number, width: number, height: number) {
  let d = "";
  for (let i = 0; i <= 400; i++) {
    const x = i / 400;
    const rise = spikes.reduce((a, at) => a + bump(x, at, width), 0);
    const y = H - 4 - wobble(x) - rise * height;
    d += `${i ? "L" : "M"}${(x * 1000).toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

type Stop = { id: string; kind: "frustration" | "delight" | "mark"; label: string };
const STOPS: Stop[] = [
  { id: "try", kind: "delight", label: "Try it on your own face" },
  { id: "problem", kind: "frustration", label: "“It was fine,” they said" },
  { id: "showcase", kind: "mark", label: "From pin to fix list" },
  { id: "how", kind: "delight", label: "How a playtest runs" },
  { id: "takeaway", kind: "mark", label: "What you take back" },
  { id: "privacy", kind: "delight", label: "Nothing leaves this computer" },
  { id: "start", kind: "frustration", label: "Catch the next flinch" },
];

/**
 * The page's signature: a reaction trace under the sticky nav. Scroll is the playhead; each section
 * stamps a pin as you pass it, so by the end the trace is a record of the visit, and every pin jumps
 * to its section. It is drawn from scroll position only; nothing here reads the visitor's face.
 */
export function scrollTrace(landing: HTMLElement): () => void {
  const stops = STOPS.filter((s) => document.getElementById(s.id));
  const H = 40;
  const red = svg("path", { class: "tr-red" }), green = svg("path", { class: "tr-green" });
  const drawn = svg("svg", { viewBox: `0 0 1000 ${H}`, preserveAspectRatio: "none", class: "tr-svg", "aria-hidden": "true" });
  drawn.append(red, green);
  const head = h("span", { class: "tr-head" });
  const clock = h("span", { class: "tr-clock" }, "0:00");
  const pins = stops.map((s) =>
    h("button", { class: `tr-pin ${s.kind}`, type: "button", title: s.label, ariaLabel: `Jump to: ${s.label}`,
      onclick: () => document.getElementById(s.id)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }) }));
  const bar = h("nav", { class: "l-trace", ariaLabel: "This page as a playtest timeline" },
    h("span", { class: "tr-label" }, "This page as a playtest"),
    h("div", { class: "tr-track" }, drawn, head, ...pins),
    clock,
  );
  // Under the sticky nav, as part of the header: it never sits over the page's text.
  (landing.querySelector(".l-nav") ?? landing.firstElementChild)!.after(bar);

  let at: number[] = [];
  const layout = () => {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    // A section's pin sits where it reaches the middle of the screen.
    at = stops.map((s) => clamp01((document.getElementById(s.id)!.getBoundingClientRect().top + scrollY - innerHeight / 2) / max));
    at.forEach((x, i) => { pins[i].style.left = `${x * 100}%`; });
    red.setAttribute("d", line(at.filter((_, i) => stops[i].kind === "frustration"), H, 0.012, 26));
    green.setAttribute("d", line(at.filter((_, i) => stops[i].kind === "delight"), H, 0.012, 22));
    update();
  };
  let frame = 0;
  const update = () => {
    frame = 0;
    const p = clamp01(scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight));
    bar.style.setProperty("--p", p.toFixed(4));
    clock.textContent = `${timecode(p * 180)} / 3:00`;
    pins.forEach((b, i) => b.classList.toggle("on", p + 0.001 >= at[i]));
  };
  const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
  // The scroll engine sizes its pinned acts after mount, so measure once that has settled, and again on resize.
  const ro = new ResizeObserver(() => layout());
  ro.observe(landing);
  addEventListener("scroll", onScroll, { passive: true });
  layout();
  return () => {
    removeEventListener("scroll", onScroll);
    ro.disconnect();
    cancelAnimationFrame(frame);
    bar.remove();
  };
}

/** The peak: under the held photo, a sample one-minute line draws with the act's progress and drops a pin at 0:42. */
export function problemTrace(landing: HTMLElement): () => void {
  const act = landing.querySelector<HTMLElement>("#problem");
  const box = act?.querySelector<HTMLElement>(".pb-svg");
  const trace = act?.querySelector<HTMLElement>(".pb-trace");
  const clock = act?.querySelector<HTMLElement>(".pb-clock");
  if (!act || !box || !trace || !clock) return () => {};
  const H = 90, AT = 0.7, THRESH = H - 4 - 40;
  const s = svg("svg", { viewBox: `0 0 1000 ${H}`, preserveAspectRatio: "none", "aria-hidden": "true" });
  const ink = svg("g", { class: "pb-ink" });
  ink.append(svg("path", { class: "tr-green", d: line([], H, 0.02, 0) }), svg("path", { class: "tr-red", d: line([AT], H, 0.035, 62) }));
  s.append(svg("line", { class: "pb-thresh", x1: "0", x2: "1000", y1: String(THRESH), y2: String(THRESH) }), ink,
    svg("line", { class: "pb-mark", x1: String(AT * 1000), x2: String(AT * 1000), y1: "0", y2: String(H) }));
  box.append(s);

  const lines = [...act.querySelectorAll<HTMLElement>(".pb-lines > p")];
  let frame = 0;
  const update = () => {
    frame = 0;
    const p = parseFloat(act.style.getPropertyValue("--sc-p")) || 0;
    // The lines share one spot; a faded-out line must not sit on top of the one being read.
    for (const l of lines) l.style.visibility = parseFloat(l.style.opacity || "0") < 0.02 ? "hidden" : "";
    const t = clamp01(p / 0.8); // the line finishes drawing before the act ends, so the pin has time to sit
    trace.style.setProperty("--t", t.toFixed(4));
    clock.textContent = `${timecode(t * 60)} / 1:00`;
    trace.classList.toggle("dropped", t >= AT + 0.015);
  };
  // Two frames: the engine writes --sc-p and the cue opacities in its own frame, so read them after it.
  let tail = 0;
  const onScroll = () => {
    if (!frame) frame = requestAnimationFrame(() => { frame = requestAnimationFrame(update); });
    clearTimeout(tail);
    tail = setTimeout(update, 300); // once more after the scroll settles
  };
  addEventListener("scroll", onScroll, { passive: true });
  update();
  return () => { removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); clearTimeout(tail); };
}
