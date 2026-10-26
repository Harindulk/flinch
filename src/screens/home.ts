import { h } from "../dom";
import { browserSupported } from "../capture";
import { timecode } from "../format";
import { icon } from "../icons";
import { KIND_LABEL, MEASURE_NOTE } from "../labels";
import { PINS, reviewDemo, sceneThumb } from "../landing/demo";
import { tryIt } from "../landing/tryit";
import { warmFaceModel } from "../face";
import { show, type Screen } from "../nav";
import { deleteSession, getSession, listSessions } from "../store";
import type { Session } from "../types";
import { reviewScreen } from "./review";
import { setupScreen } from "./setup";

const REPO = "https://github.com/Harindulk/flinch";

const PHOTOS = {
  arcade: { src: "landing/gitarfreaks-and-drummania-v-cabinets-and-player.jpg", w: 1600, h: 1200, alt: "A player mid-song at a drum arcade cabinet, concentrating hard" },
  jam: { src: "landing/global-game-jam-2012-6896271611.jpg", w: 1600, h: 1067, alt: "A room of developers building games at the Global Game Jam" },
  paper: { src: "landing/video-game-design-on-paper-at-game.jpg", w: 1600, h: 900, alt: "Paper sketches of a game level and enemies, made at a game jam" },
  lan: { src: "landing/lan-party.jpg", w: 1500, h: 996, alt: "Friends gaming together on laptops in a living room" },
};
const CREDITS = [
  ["GitarFreaks and DrumMania V cabinets and player", "David Monniaux", "CC BY-SA 3.0", "https://commons.wikimedia.org/w/index.php?curid=426169"],
  ["Global Game Jam 2012", "Laboratório Criação Digital", "CC BY-SA 2.0", "https://commons.wikimedia.org/w/index.php?curid=26510609"],
  ["Video Game Design on Paper at Game Jam", "I G", "CC BY 2.0", "https://commons.wikimedia.org/w/index.php?curid=101557348"],
  ["LAN Party", "Stuballew", "CC BY-SA 3.0", "https://commons.wikimedia.org/w/index.php?curid=17848626"],
];

const photo = (p: (typeof PHOTOS)[keyof typeof PHOTOS], cls = "", lazy = true) =>
  h("img", { src: p.src, width: p.w, height: p.h, alt: p.alt, class: `photo ${cls}`, loading: lazy ? "lazy" : "eager", decoding: "async" });

export function homeScreen(): Screen {
  return (root) => {
    const ok = browserSupported();
    const start = () => show(setupScreen());
    const sessions = h("section", { class: "sessions l-wrap", id: "sessions" });
    const tryit = tryIt();

    const open = async (s: Session) => {
      const saved = await getSession(s.id);
      if (saved) show(reviewScreen(saved.session, saved.videos), `#/review/${s.id}`);
    };
    const row = (s: Session) => {
      const moments = s.moments.filter((m) => !m.dismissed).length;
      const cover = s.moments.find((m) => m.thumb && !m.dismissed)?.thumb;
      const del = h("button", { class: "ghost", title: "Delete this playtest", ariaLabel: `Delete the playtest with ${s.tester}` }, icon("trash"), "Delete");
      const el = h("article", { class: "session-row", dataset: { id: s.id } },
        cover ? h("img", { class: "cover", src: cover, alt: "" }) : h("div", { class: "cover" }),
        h("div", {},
          h("div", { class: "title" }, `${s.tester} · ${s.build}`),
          h("div", { class: "meta" }, `${new Date(s.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · ${timecode(s.duration)} · ${moments} moment${moments === 1 ? "" : "s"}`),
        ),
        h("button", { class: "secondary", onclick: () => open(s) }, "Open"),
        del,
      );
      del.onclick = async () => {
        if (!confirm(`Delete the playtest with ${s.tester}? The recording is removed from this computer.`)) return;
        await deleteSession(s.id);
        el.remove();
        if (!sessions.querySelector(".session-row")) sessions.replaceChildren();
      };
      return el;
    };
    if (ok)
      listSessions().then(
        (list) => list.length && sessions.replaceChildren(h("h2", { class: "label" }, "Your playtests on this computer"), ...list.map(row)),
        () => sessions.replaceChildren(h("p", { class: "notice warn" }, "This browser won't let Flinch store playtests (a private window?). You can still record; download each one before closing.")),
      );

    const action = ok
      ? h("button", { class: "primary l-cta", id: "new-playtest", onclick: start }, "Start a playtest")
      : h("p", { class: "notice warn", id: "unsupported" },
          window.isSecureContext
            ? "Flinch needs desktop Chrome or Edge: it uses screen recording and camera features other browsers don't have yet."
            : "Chrome only allows the camera and screen sharing on a secure address. Open Flinch at http://localhost:5173 (or an https link), not a network IP.");

    root.append(
      h("div", { class: "landing" },
        h("nav", { class: "l-nav l-wrap", ariaLabel: "Flinch" },
          h("a", { class: "l-word", href: "#/" }, "Flinch"),
          h("span", { class: "spacer" }),
          h("a", { href: "#try", onclick: jump("try") }, "Try it"),
          h("a", { href: "#how", onclick: jump("how") }, "How it works"),
          h("a", { href: "#takeaway", onclick: jump("takeaway") }, "What you get"),
          h("a", { href: "#privacy", onclick: jump("privacy") }, "Privacy"),
          h("a", { href: REPO, rel: "noopener" }, "GitHub"),
          ok ? h("button", { class: "primary small l-nav-cta", type: "button", onclick: start }, "Start a playtest") : null,
        ),
        h("main", {},
          hero(action),
          sessions,
          tryit.el,
          problem(),
          showcase(),
          howItWorks(),
          takeaway(),
          privacy(),
          faq(),
          closing(ok),
        ),
        footer(),
      ),
    );
    reveal(root);
    if (ok) warmFaceModel();
    return () => tryit.stop(); // never leave the visitor's camera on after they move on
  };
}

/** In-page links without touching the hash router. */
const jump = (id: string) => (e: Event) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
};

function hero(action: HTMLElement) {
  // The headline flinches with the demo: each time the drawn tester frowns, the word jolts once.
  const word = h("span", { class: "l-flinch" }, "flinched");
  const jolt = (kind: string) => {
    if (kind !== "frustration" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    word.classList.remove("jolt");
    void word.offsetWidth; // restart the animation
    word.classList.add("jolt");
  };
  return h("header", { class: "l-hero" },
    h("div", { class: "l-wrap l-hero-copy" },
      h("h1", {}, "See the moment they ", word, "."),
      h("p", { class: "l-lede" }, "Flinch records your game and your tester's face, then pins every sigh, groan and grin so you can replay it. It runs in one Chrome tab and uploads nothing."),
      action,
      h("a", { class: "l-try-link", href: "#try", onclick: jump("try") }, "or try it on your own face first"),
    ),
    h("div", { class: "l-stage shutter" },
      h("div", { class: "l-stage-inner" }, reviewDemo(jolt)),
    ),
  );
}

function problem() {
  return h("section", { class: "l-problem l-wrap", id: "problem" },
    h("div", { class: "l-problem-copy" },
      h("h2", {}, "“It was fine,” they said."),
      h("p", {}, "Friends who test your game are kind. They say it was fine after dying at the same jump five times. You were watching the screen, so you missed the sigh."),
      h("p", {}, "Flinch watches the face instead. Ten seconds of calibration teaches it what this tester looks like at rest; after that, every clear change from rest becomes a pin on the timeline."),
    ),
    h("figure", { class: "l-problem-pic" }, photo(PHOTOS.arcade, "tall"), h("figcaption", {}, "Concentration looks like a frown. Flinch learns each tester's resting face so it only pins what changes.")),
  );
}

/** One moment, three states. The middle copy is live: typing a note and keeping it turns it into the third. */
function showcase() {
  const p = PINS[0];
  const card = (state: "pinned" | "open" | "kept", note = "") => {
    const head = h("div", { class: "m-head" },
      h("span", { class: "m-time" }, timecode(p.t)),
      h("span", { class: "m-kind" }, KIND_LABEL[p.kind]),
      h("span", { class: "m-x" }, `Clear change · ${p.strength.toFixed(1)}×`),
    );
    const body: (Node | null)[] = [];
    if (state === "open") {
      const field = h("input", { class: "m-note", value: "Long jump: move the ledge one tile closer", ariaLabel: "Note for 0:42" });
      const keep = h("button", { class: "primary small", type: "button" }, icon("check"), "Keep");
      keep.onclick = () => {
        live.replaceWith(card("kept", field.value.trim() || "Checked, nothing to fix"));
      };
      body.push(h("div", { class: "m-replay" }, icon("play"), `Replaying from ${timecode(p.t - 3)}`), h("div", { class: "m-edit" }, field, keep));
    }
    if (state === "kept") body.push(h("div", { class: "m-kept" }, icon("check"), h("span", {}, note), h("span", { class: "m-file" }, "in notes.md")));
    const el = h("article", { class: `m-card ${state} frustration`, dataset: { ui: "" } } as never,
      h("div", { class: "m-thumb" }, sceneThumb("fall")),
      h("div", { class: "m-body" }, head, ...body.filter((n): n is Node => n !== null)),
    );
    return el;
  };
  const live = card("open");
  const state = (word: string, el: HTMLElement) => h("div", { class: "s-row" }, h("p", { class: "s-word" }, word), el);
  return h("section", { class: "l-showcase l-wrap", id: "showcase" },
    h("h2", {}, "Every pin becomes a fix"),
    state("Pinned", card("pinned")),
    state("Replayed", live),
    state("On the list", card("kept", "Long jump: move the ledge one tile closer")),
  );
}

function howItWorks() {
  const step = (lead: string, call: HTMLElement, response: HTMLElement, wide = false) =>
    h("li", { class: `h-step${wide ? " wide" : ""}` }, h("p", { class: "h-lead" }, lead), h("div", { class: "h-call" }, call), h("div", { class: "h-resp" }, response));
  const pickBtn = h("div", { class: "f-tile", dataset: { ui: "" } } as never,
    h("div", { class: "f-tile-h" }, h("span", { class: "num" }, "1"), "Game window"),
    h("div", { class: "f-btn" }, icon("monitor"), "Choose game window"),
  );
  const picked = h("div", { class: "f-chips", dataset: { ui: "" } } as never,
    h("span", { class: "chip ok" }, icon("check"), "Drive Away 0.9 — window shared"),
    h("span", { class: "chip ok" }, icon("check"), "Camera and mic on"),
  );
  const calib = h("div", { class: "f-calib", dataset: { ui: "" } } as never,
    h("strong", {}, "Relax and look at the game"),
    h("span", { class: "f-count" }, "7"),
    h("span", { class: "f-bar" }, h("i", {})),
    h("span", { class: "face-check yes" }, "Face found"),
  );
  const tracked = h("div", { class: "f-chips", dataset: { ui: "" } } as never, h("span", { class: "chip ok" }, icon("face"), "Face tracked"));
  const recBar = h("div", { class: "f-rec", dataset: { ui: "" } } as never,
    h("span", { class: "rec-status" }, h("i", { class: "rec-dot" }), "Recording"),
    h("span", { class: "clock" }, "2:31"),
    h("span", { class: "who" }, "Kasun · Drive Away 0.9"),
    h("span", { class: "live-count" }, "3 possible reactions"),
    h("span", { class: "spacer" }),
    h("span", { class: "f-mark" }, icon("flag"), "Mark", h("kbd", {}, "M")),
    h("span", { class: "f-stop" }, icon("stop"), "Stop"),
  );
  const pins = h("div", { class: "f-pins", dataset: { ui: "" } } as never,
    ...PINS.map((p) => h("div", { class: `f-pin ${p.kind}` }, h("span", { class: "d-time" }, timecode(p.t)), h("span", { class: "d-kind" }, KIND_LABEL[p.kind]), h("span", { class: "d-note" }, p.note))),
    h("p", { class: "f-foot" }, "Review opens on the strongest one, three seconds before it happened."),
  );
  return h("section", { class: "l-how l-wrap", id: "how" },
    h("h2", {}, "How a playtest runs"),
    h("ol", { class: "h-steps" },
      step("First, pick the game window and turn on the camera.", pickBtn, picked),
      step("Then, ten seconds of resting face.", calib, tracked),
      step("Then they play, and you press Stop.", recBar, pins, true),
    ),
    h("figure", { class: "l-how-pic" }, photo(PHOTOS.jam, "wide"), h("figcaption", {}, "Any game window works: a browser build, a Unity or Godot player, an emulator.")),
  );
}

function takeaway() {
  const notes = `# Flinch playtest: Kasun · Drive Away 0.9

26 Oct 2026, 21:14 · 3:00 long · 3 moments

| Time | Moment              | Expression change | Note                     |
|------|---------------------|-------------------|--------------------------|
| 0:42 | Possible frustration| 5.8×              | Move the ledge closer    |
| 1:51 | Possible delight    | 7.4×              | Keep the hidden star     |
| 2:20 | Your mark           | —                 | Boss door reads as a wall|`;
  const reel = h("div", { class: "f-reel", dataset: { ui: "" } } as never,
    h("div", { class: "f-reel-card" }, h("span", { class: "f-reel-bar" }), h("strong", {}, "0:42 · Possible frustration"), h("span", {}, "Move the ledge closer")),
    h("div", { class: "f-reel-clip" }, sceneThumb("fall"), h("span", { class: "f-reel-label" }, "0:42 · Possible frustration")),
  );
  const files = h("div", { class: "f-files", dataset: { ui: "" } } as never,
    ...[["flinch-kasun-drive-away-0-9-2026-10-26-game.webm", "56 MB"], ["flinch-kasun-drive-away-0-9-2026-10-26-face.webm", "22 MB"], ["flinch-kasun-drive-away-0-9-2026-10-26-reel.mp4", "6 MB"]].map(([n, s]) =>
      h("div", { class: "f-file" }, icon("download"), h("span", { class: "f-name" }, n), h("span", { class: "f-size" }, s))),
  );
  const row = (title: string, text: string, frag: HTMLElement, cls = "") =>
    h("div", { class: `t-row ${cls}` }, h("div", { class: "t-copy" }, h("h3", {}, title), h("p", {}, text)), h("div", { class: "t-frag" }, frag));
  return h("section", { class: "l-take l-wrap", id: "takeaway" },
    h("h2", {}, "What you take back to the build"),
    row("A fix list", "Every kept moment with its time, size of change and your note, as Markdown you can paste into your tracker.", h("pre", { class: "t-code" }, h("code", {}, notes))),
    row("A highlight reel", "Each moment as a short clip with a title card and the reaction line under it. MP4 where Chrome can make one.", reel, "flip"),
    row("The whole session", "The game and the face as two files, so nothing is lost if you want to watch it all again.", files),
    row("Did the fix work?", "Test the next build and compare: the last playtest's line sits dashed behind the new one, with a plain verdict.", compareFragment(), "flip"),
    h("figure", { class: "l-take-pic" }, photo(PHOTOS.paper, "wide"), h("figcaption", {}, "Then it's back to the level design.")),
  );
}

/** A cropped piece of Review's compare panel: last build dashed with its spike, this build solid and flat. */
function compareFragment() {
  const pts = (spike: number) => {
    const out: string[] = [];
    for (let i = 0; i <= 120; i++) {
      const x = 8 + i * 4.6;
      const z = 0.4 + 0.25 * Math.sin(i * 0.9) + spike * Math.exp(-((i - 38) ** 2) / 10);
      out.push(`${x.toFixed(1)},${(82 - z * 9).toFixed(1)}`);
    }
    return out.join(" ");
  };
  const wrap = document.createElement("div");
  wrap.innerHTML = `<svg viewBox="0 0 570 90" class="c-line" aria-hidden="true">
    <line x1="8" x2="562" y1="82.5" y2="82.5" stroke="#2a2d33"/><line x1="8" x2="562" y1="59.5" y2="59.5" stroke="#2a2d33" stroke-dasharray="3 4"/>
    <polyline points="${pts(6.4)}" fill="none" stroke="#ff5d5d" stroke-width="1.5" stroke-dasharray="5 4" opacity="0.5"/>
    <polyline points="${pts(0.6)}" fill="none" stroke="#ff5d5d" stroke-width="2"/></svg>`;
  return h("div", { class: "f-compare", dataset: { ui: "" } },
    wrap.firstElementChild as SVGSVGElement,
    h("div", { class: "f-cmp-row" }, h("span", { class: "f-cmp-key" }, "Dashed: Drive Away 0.9"), h("span", { class: "f-cmp-sel" }, "Drive Away 0.9 · Kasun · 24 Oct")),
    h("p", {}, h("b", {}, "This playtest: "), "0 possible frustrations · 1 possible delight"),
    h("p", {}, h("b", {}, "Drive Away 0.9: "), "3 possible frustrations, strongest 6.4× · 0 possible delights"),
    h("p", { class: "f-cmp-verdict" }, "Fewer frustration pins than Drive Away 0.9, and no stronger. More delight too."),
  );
}

function privacy() {
  const facts = [
    ["The face model runs in your browser.", "Google's MediaPipe Face Landmarker, loaded from this site. No video is sent anywhere to be read."],
    ["Recordings stay on this computer.", "Kept in this browser's storage until you delete them from the home screen."],
    ["No account, no server, no analytics.", "There is nothing to sign up for and nothing tracking the page."],
    ["Open source, MIT licence.", "Every line is on GitHub to read, change and run yourself."],
  ];
  return h("section", { class: "l-privacy", id: "privacy" },
    h("div", { class: "l-wrap l-privacy-grid" },
      h("div", {},
        h("h2", {}, "Nothing leaves this computer."),
        h("dl", { class: "p-facts" }, ...facts.flatMap(([t, d]) => [h("dt", {}, t), h("dd", {}, d)])),
        h("a", { class: "p-link", href: REPO, rel: "noopener" }, "Read the code on GitHub"),
      ),
      h("figure", { class: "l-privacy-pic" }, photo(PHOTOS.lan, "square"), h("figcaption", {}, "Built for testing at home, with a friend next to you.")),
    ),
  );
}

function faq() {
  const qa: [string, string][] = [
    ["Does Flinch read emotions?", "No. It measures how far the tester's face moves from their own resting face: brows, lips, smile. A pin says where to look; you decide what it meant."],
    ["Does anything get uploaded?", "No. The page, the face model and your recordings all stay in your browser. There's no account and no server."],
    ["What do I need?", "Desktop Chrome or Edge, a webcam, and a game in another window. The browser asks once for the camera and the window."],
    ["Does my tester install anything?", "No. They sit in front of the camera and play. They tick a consent box before anything is recorded."],
    ["How long can a session be?", "About twenty minutes works well. The recording is held in memory until you press Stop, so very long sessions use a lot of it."],
    ["What if two people are on camera?", "Flinch follows the face nearest the camera and tells you it saw two."],
    ["What does it cost?", "Nothing. Flinch is free and open source under the MIT licence."],
  ];
  const pane = h("p", { class: "q-pane", ariaLive: "polite" });
  const items = qa.map(([q, a], i) => {
    const ans = h("p", { class: "q-inline" }, a);
    const b = h("button", { class: "q-q", type: "button", ariaExpanded: i === 0 ? "true" : "false" }, h("i", { class: "q-dot" }), q);
    const pick = () => {
      items.forEach((it, j) => {
        it.b.classList.toggle("on", j === i);
        it.b.ariaExpanded = j === i ? "true" : "false";
        it.li.classList.toggle("open", j === i);
      });
      pane.textContent = a;
    };
    b.addEventListener("click", pick);
    b.addEventListener("focus", pick);
    b.addEventListener("mouseenter", () => matchMedia("(hover: hover)").matches && pick());
    const li = h("li", {}, b, ans);
    return { b, li, pick };
  });
  queueMicrotask(() => items[0].pick());
  return h("section", { class: "l-faq l-wrap", id: "faq" },
    h("div", { class: "q-list" }, h("h2", {}, "Questions"), h("ul", {}, ...items.map((i) => i.li))),
    pane,
  );
}

function closing(ok: boolean) {
  const tester = h("input", { id: "cta-tester", value: "Kasun", maxLength: 40, autocomplete: "off" });
  const build = h("input", { id: "cta-build", value: "Drive Away 0.9", maxLength: 60, autocomplete: "off" });
  const go = h("button", { class: "primary big", type: "submit", disabled: !ok }, "Start this playtest");
  const form = h("form", { class: "c-dialog", dataset: { ui: "" } } as never,
    h("h3", {}, "New playtest"),
    h("label", {}, "Tester's first name", tester),
    h("label", {}, "Build", build),
    go,
  );
  form.onsubmit = (e) => {
    e.preventDefault();
    show(setupScreen({ tester: tester.value.trim(), build: build.value.trim() }));
  };
  return h("section", { class: "l-close", id: "start" },
    h("div", { class: "l-wrap l-close-grid" },
      h("div", { class: "c-copy" },
        h("h2", {}, "Catch the next flinch."),
        h("p", {}, ok ? "This opens the setup with these filled in. Next you pick the game window and turn on the camera." : "Open this page in desktop Chrome or Edge to start a playtest."),
      ),
      form,
    ),
  );
}

function footer() {
  return h("footer", { class: "l-foot l-wrap" },
    h("div", { class: "l-foot-line" },
      h("span", {}, "Flinch · a playtest recorder by StarFun Games"),
      h("span", { class: "l-foot-links" }, h("a", { href: REPO, rel: "noopener" }, "GitHub"), h("a", { href: `${REPO}/blob/main/LICENSE`, rel: "noopener" }, "MIT licence"), h("a", { href: "#how", onclick: jump("how") }, "How it works")),
      h("span", {}, "2026 · nothing is uploaded"),
    ),
    h("p", { class: "l-credits" }, "Photographs: ", ...CREDITS.flatMap(([t, by, lic, url], i) => [i ? "; " : "", h("a", { href: url, rel: "noopener" }, `“${t}”`), ` by ${by}, ${lic}`]), ", via Wikimedia Commons. ", MEASURE_NOTE),
  );
}

/** Section parts rise in as they enter; content is visible without script or with reduced motion. */
function reveal(root: HTMLElement) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
  const targets = root.querySelectorAll<HTMLElement>(".landing section > *, .landing section .l-wrap > *, .h-step, .t-row, .s-row");
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) {
      e.target.classList.add("in");
      io.unobserve(e.target);
    }
  }, { rootMargin: "0px 0px -8% 0px" });
  targets.forEach((t, i) => {
    t.classList.add("rise");
    t.style.setProperty("--d", `${(i % 4) * 70}ms`);
    io.observe(t);
  });
}
