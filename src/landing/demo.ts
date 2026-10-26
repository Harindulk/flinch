/**
 * The landing page's working fragment: a cropped Review panel. Clicking a pin replays that moment of a
 * drawn game with a drawn tester's face, the way the real Review screen replays a recording.
 */
import { h } from "../dom";
import { timecode } from "../format";
import { KIND_LABEL } from "../labels";
import type { MomentKind } from "../types";

const NS = "http://www.w3.org/2000/svg";
const svg = (tag: string, attrs: Record<string, string | number> = {}, ...kids: SVGElement[]) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...kids);
  return el;
};

export const SESSION_S = 180;
type Pin = { t: number; kind: MomentKind; note: string; scene: "fall" | "star" | "door"; strength: number };
export const PINS: Pin[] = [
  { t: 42, kind: "frustration", note: "the long jump", scene: "fall", strength: 5.8 },
  { t: 111, kind: "delight", note: "the hidden star", scene: "star", strength: 7.4 },
  { t: 140, kind: "mark", note: "boss door", scene: "door", strength: 0 },
];

// Mouth and brow shapes for the drawn face (CSS can tween between paths with the same commands).
const FACE = {
  rest: { mouth: "M48 66 Q60 69 72 66", browL: "M40 42 Q46 40 52 42", browR: "M68 42 Q74 40 80 42" },
  frown: { mouth: "M47 70 Q60 61 73 70", browL: "M40 40 Q46 44 53 46", browR: "M67 46 Q74 44 80 40" },
  smile: { mouth: "M45 63 Q60 78 75 63", browL: "M40 39 Q46 35 52 38", browR: "M68 38 Q74 35 80 39" },
};

function gameScene() {
  const hero = svg("g", { class: "g-hero" },
    svg("rect", { x: -14, y: -28, width: 28, height: 28, rx: 5, fill: "#ffb547" }),
    svg("rect", { x: 1, y: -21, width: 5, height: 7, rx: 1, fill: "#1b1203" }),
    svg("rect", { x: 8, y: -21, width: 4, height: 7, rx: 1, fill: "#1b1203" }),
  );
  const star = svg("polygon", { class: "g-star", points: "0,-14 4,-4 15,-4 6,3 9,14 0,7 -9,14 -6,3 -15,-4 -4,-4", fill: "#b8f35a" });
  const starG = svg("g", { transform: "translate(486 118)" }, star);
  const scene = svg("svg", { viewBox: "0 0 640 300", class: "g-scene", role: "img", "aria-label": "A side-scrolling game level" },
    svg("rect", { width: 640, height: 300, fill: "#16212c" }),
    svg("rect", { x: 0, y: 150, width: 640, height: 80, fill: "#1c2a37" }),
    svg("rect", { x: 60, y: 120, width: 90, height: 110, fill: "#22323f" }),
    svg("rect", { x: 210, y: 96, width: 60, height: 134, fill: "#22323f" }),
    svg("rect", { x: 0, y: 230, width: 300, height: 70, fill: "#2f4255" }),
    svg("rect", { x: 382, y: 230, width: 258, height: 70, fill: "#2f4255" }),
    svg("rect", { x: 300, y: 262, width: 82, height: 38, fill: "#0d141b" }),
    svg("rect", { x: 430, y: 168, width: 112, height: 14, fill: "#3d566c" }),
    svg("rect", { x: 576, y: 160, width: 40, height: 70, fill: "#0d141b" }),
    svg("rect", { x: 582, y: 166, width: 28, height: 64, fill: "#45263a" }),
    starG,
  );
  scene.append(hero);
  return { scene, hero, star: starG };
}

function faceView() {
  const mouth = svg("path", { class: "f-mouth", d: FACE.rest.mouth, fill: "none", stroke: "#3b2418", "stroke-width": 3, "stroke-linecap": "round" });
  const browL = svg("path", { class: "f-brow", d: FACE.rest.browL, fill: "none", stroke: "#2b1d14", "stroke-width": 3, "stroke-linecap": "round" });
  const browR = svg("path", { class: "f-brow", d: FACE.rest.browR, fill: "none", stroke: "#2b1d14", "stroke-width": 3, "stroke-linecap": "round" });
  const el = svg("svg", { viewBox: "0 0 120 90", class: "g-face", role: "img", "aria-label": "The tester's face" },
    svg("rect", { width: 120, height: 90, fill: "#2a2f36" }),
    svg("rect", { x: 22, y: 78, width: 76, height: 20, rx: 10, fill: "#4b5866" }),
    svg("ellipse", { cx: 60, cy: 52, rx: 26, ry: 30, fill: "#c98e6b" }),
    svg("path", { d: "M34 44 Q36 20 60 20 Q84 20 86 44 Q80 30 60 30 Q40 30 34 44 Z", fill: "#2b1d14" }),
    svg("circle", { cx: 49, cy: 51, r: 2.6, fill: "#1b1208" }),
    svg("circle", { cx: 71, cy: 51, r: 2.6, fill: "#1b1208" }),
    browL, browR, mouth,
  );
  const set = (e: keyof typeof FACE) => {
    mouth.setAttribute("d", FACE[e].mouth);
    browL.setAttribute("d", FACE[e].browL);
    browR.setAttribute("d", FACE[e].browR);
  };
  return { el, set };
}

const X0 = 10, X1 = 590;
const tx = (t: number) => X0 + (t / SESSION_S) * (X1 - X0);

function timelineView() {
  const line = (spikes: [number, number][]) => {
    const pts: string[] = [];
    for (let t = 0; t <= SESSION_S; t += 1.5) {
      let z = 0.35 + 0.25 * Math.sin(t * 1.7) * Math.sin(t * 0.31);
      for (const [c, hgt] of spikes) z += hgt * Math.exp(-((t - c) ** 2) / 6);
      pts.push(`${tx(t).toFixed(1)},${(80 - Math.min(z, 8) * 8.5).toFixed(1)}`);
    }
    return pts.join(" ");
  };
  const playhead = svg("line", { x1: tx(0), x2: tx(0), y1: 0, y2: 90, stroke: "#ecebe6", "stroke-width": 1.5 });
  const pins = PINS.map((p) => svg("polygon", { class: `t-pin ${p.kind}`, points: `${tx(p.t) - 6},1 ${tx(p.t) + 6},1 ${tx(p.t)},12` }));
  const el = svg("svg", { viewBox: "0 0 600 90", class: "t-line", "aria-hidden": "true" },
    svg("line", { x1: X0, x2: X1, y1: 80.5, y2: 80.5, stroke: "#2a2d33" }),
    svg("line", { x1: X0, x2: X1, y1: 58.5, y2: 58.5, stroke: "#2a2d33", "stroke-dasharray": "3 4" }),
    ...PINS.map((p) => svg("line", { x1: tx(p.t), x2: tx(p.t), y1: 12, y2: 80, class: `t-stem ${p.kind}` })),
    svg("polyline", { points: line([[42, 6.2]]), fill: "none", stroke: "#ff5d5d", "stroke-width": 2, "stroke-linejoin": "round" }),
    svg("polyline", { points: line([[111, 7.6]]), fill: "none", stroke: "#b8f35a", "stroke-width": 2, "stroke-linejoin": "round" }),
    ...pins,
    playhead,
  );
  const move = (t: number) => {
    playhead.setAttribute("x1", String(tx(t)));
    playhead.setAttribute("x2", String(tx(t)));
  };
  return { el, move, pins };
}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The hero fragment. Returns its root; the first pin is selected and paused on its moment. */
export function reviewDemo(): HTMLElement {
  const game = gameScene();
  const face = faceView();
  const line = timelineView();
  const clock = h("span", { class: "d-clock" }, `0:39 / ${timecode(SESSION_S)}`);
  const caption = h("p", { class: "d-caption", ariaLive: "polite" });
  const rows = PINS.map((p, i) =>
    h("button", { class: `d-row ${p.kind}`, type: "button", dataset: { i: String(i) }, ariaLabel: `Replay ${KIND_LABEL[p.kind]} at ${timecode(p.t)}, ${p.note}` },
      h("span", { class: "d-time" }, timecode(p.t)),
      h("span", { class: "d-kind" }, KIND_LABEL[p.kind]),
      h("span", { class: "d-note" }, p.note),
      h("span", { class: "d-x" }, p.kind === "mark" ? "M key" : `${p.strength.toFixed(1)}×`),
    ),
  );
  const pinHits = PINS.map((p, i) =>
    // Pointer shortcut onto the timeline pins; keyboard users replay the same moments from the rows below.
    h("span", { class: `d-pinhit ${p.kind}`, style: `left:${(tx(p.t) / 600) * 100}%`, dataset: { i: String(i) } }),
  );
  let anims: Animation[] = [];
  let clockTimer = 0;
  let faceTimer = 0;

  const play = (i: number) => {
    const p = PINS[i];
    anims.forEach((a) => a.cancel());
    clearInterval(clockTimer);
    clearTimeout(faceTimer); // a replay cut short must not change the next one's face
    rows.forEach((r, j) => r.classList.toggle("on", j === i));
    line.pins.forEach((pin, j) => pin.classList.toggle("on", j === i));
    caption.textContent = `${timecode(p.t)} · ${KIND_LABEL[p.kind]}: ${p.note}. Replaying from ${timecode(p.t - 3)}.`;
    face.set("rest");
    const from = p.t - 3, to = p.t + 1;
    const dur = reduced() ? 1 : 2600;
    const t0 = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      const t = from + (to - from) * k;
      line.move(t);
      clock.textContent = `${timecode(t)} / ${timecode(SESSION_S)}`;
      if (k >= 1) clearInterval(clockTimer);
    };
    clockTimer = window.setInterval(tick, 50);
    tick();
    const moment = 3 / 4; // the pinned second, as a share of the 4 s replay
    faceTimer = window.setTimeout(() => face.set(p.kind === "frustration" ? "frown" : p.kind === "delight" ? "smile" : "rest"), reduced() ? 0 : dur * moment);
    const kf =
      p.scene === "fall"
        ? [{ transform: "translate(150px,230px)" }, { transform: "translate(285px,230px)", offset: 0.45 }, { transform: "translate(325px,190px)", offset: 0.62 }, { transform: "translate(345px,250px)", offset: 0.75 }, { transform: "translate(350px,330px)" }]
        : p.scene === "star"
          ? [{ transform: "translate(380px,230px)" }, { transform: "translate(440px,150px)", offset: 0.4 }, { transform: "translate(470px,168px)", offset: 0.6 }, { transform: "translate(486px,130px)", offset: 0.75 }, { transform: "translate(500px,168px)" }]
          : [{ transform: "translate(470px,230px)" }, { transform: "translate(596px,230px)" }];
    anims = [game.hero.animate(kf, { duration: dur, easing: "linear", fill: "forwards" })];
    game.star.style.opacity = p.scene === "star" ? "1" : "0";
    if (p.scene === "star")
      anims.push(game.star.animate([{ transform: "translate(486px,118px) scale(1)" }, { transform: "translate(486px,118px) scale(1)", offset: 0.74 }, { transform: "translate(486px,104px) scale(1.9)", opacity: 0 }], { duration: dur, fill: "forwards" }));
  };

  const root = h("div", { class: "d-review", dataset: { ui: "" } } as never,
    h("div", { class: "d-stage" }, game.scene, h("div", { class: "d-face" }, face.el)),
    h("div", { class: "d-bar" }, h("span", { class: "d-dot" }), clock, h("span", { class: "spacer" }), h("span", { class: "d-legend f" }, "Tension"), h("span", { class: "d-legend d" }, "Smile")),
    h("div", { class: "d-timeline" }, line.el, ...pinHits),
    h("div", { class: "d-rows" }, ...rows),
    caption,
  );
  for (const b of [...rows, ...pinHits]) b.addEventListener("click", () => play(Number(b.dataset.i)));
  // Open on the first pin, paused just before the moment: the first thing a visitor sees is a real replay waiting.
  requestAnimationFrame(() => play(0));
  return root;
}

/** A small still of the drawn level, for moment thumbnails elsewhere on the page. */
export function sceneThumb(scene: Pin["scene"]): SVGSVGElement {
  const { scene: s, hero, star } = gameScene();
  hero.setAttribute("transform", scene === "fall" ? "translate(345 252)" : scene === "star" ? "translate(486 130)" : "translate(590 230)");
  if (scene !== "star") star.setAttribute("opacity", "0");
  s.setAttribute("aria-label", `Game frame: ${scene === "fall" ? "falling into the pit" : scene === "star" ? "grabbing the hidden star" : "at the boss door"}`);
  return s as SVGSVGElement;
}
