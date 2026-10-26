import { h } from "../dom";
import { browserSupported } from "../capture";
import { timecode } from "../format";
import { icon } from "../icons";
import { show, type Screen } from "../nav";
import { deleteSession, getSession, listSessions } from "../store";
import type { Session } from "../types";
import { reviewScreen } from "./review";
import { setupScreen } from "./setup";

export function homeScreen(): Screen {
  return (root) => {
    const ok = browserSupported();
    const sessions = h("section", { class: "sessions", id: "sessions" });

    const open = async (s: Session) => {
      const saved = await getSession(s.id);
      if (saved) show(reviewScreen(saved.session, saved.videos), `#/review/${s.id}`);
    };

    const row = (s: Session) => {
      const moments = s.moments.filter((m) => !m.dismissed).length;
      const del = h("button", { class: "ghost", title: "Delete this playtest", ariaLabel: `Delete the playtest with ${s.tester}` }, icon("trash"), "Delete");
      const cover = s.moments.find((m) => m.thumb && !m.dismissed)?.thumb;
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
        (list) => list.length && sessions.replaceChildren(h("h2", { class: "label" }, "Playtests on this computer"), ...list.map(row)),
        () => sessions.replaceChildren(h("p", { class: "notice warn" }, "This browser won't let Flinch store playtests (a private window?). You can still record; download each one before closing.")),
      );

    root.append(
      h("main", { class: "home" },
        h("header", { class: "brand" },
          h("h1", {}, "Flinch"),
          h("p", { class: "tagline" }, "Your playtester won't tell you. Their face will."),
        ),
        heroLine(),
        ok
          ? h("button", { class: "primary big", id: "new-playtest", onclick: () => show(setupScreen()) }, icon("play"), "New playtest")
          : h("p", { class: "notice warn", id: "unsupported" },
              window.isSecureContext
                ? "Flinch needs desktop Chrome or Edge: it uses screen recording and camera features other browsers don't have yet."
                : "Chrome only allows the camera and screen sharing on a secure address. Open Flinch at http://localhost:5173 (or an https link), not a network IP."),
        sessions,
        h("ol", { class: "steps" },
          h("li", {}, h("b", {}, "Pick the game window"), " — any game: a browser tab, a Unity build, an emulator."),
          h("li", {}, h("b", {}, "Turn on the camera"), " — Flinch learns your tester's resting face in ten seconds."),
          h("li", {}, h("b", {}, "Play, then Stop"), " — the moments their face changed most come back pinned. Click one to replay it."),
        ),
        h("p", { class: "privacy" }, "Nothing leaves this computer. Recordings and face data stay in this browser."),
      ),
    );
  };
}

/** A decorative reaction line with two pins: what a session looks like after Stop. */
function heroLine(): SVGSVGElement {
  const wrap = document.createElement("div");
  wrap.innerHTML = `<svg class="hero-line" viewBox="0 0 640 120" aria-hidden="true">
    <line x1="0" y1="100" x2="640" y2="100" stroke="#2a2d33"/>
    <line x1="0" y1="62" x2="640" y2="62" stroke="#2a2d33" stroke-dasharray="3 4"/>
    <path d="M0 98 L70 96 L120 99 L160 95 L200 97 L232 30 L248 22 L262 40 L280 96 L340 98 L400 97 L460 99 L520 96 L640 98" fill="none" stroke="#ff5d5d" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M0 99 L120 98 L200 99 L300 98 L380 99 L420 97 L452 44 L470 18 L490 30 L506 92 L560 98 L640 99" fill="none" stroke="#b8f35a" stroke-width="2.5" stroke-linejoin="round"/>
    <line x1="248" y1="10" x2="248" y2="100" stroke="#ff5d5d"/><path d="M242 2 L254 2 L248 12 Z" fill="#ff5d5d"/>
    <line x1="470" y1="10" x2="470" y2="100" stroke="#b8f35a"/><path d="M464 2 L476 2 L470 12 Z" fill="#b8f35a"/>
    <text x="256" y="16">0:42 · the jump</text><text x="478" y="16">1:51 · first drift</text>
  </svg>`;
  return wrap.firstElementChild as SVGSVGElement;
}
