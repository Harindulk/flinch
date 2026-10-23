import { h } from "../dom";
import { browserSupported } from "../capture";
import { timecode } from "../format";
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
      const del = h("button", { class: "ghost", title: "Delete this playtest" }, "Delete");
      const el = h("article", { class: "session-row", dataset: { id: s.id } },
        h("div", {},
          h("div", { class: "title" }, `${s.tester} · ${s.build}`),
          h("div", { class: "meta" }, `${new Date(s.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · ${timecode(s.duration)} · ${moments} moment${moments === 1 ? "" : "s"}`),
        ),
        h("span", {}),
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
        (list) => list.length && sessions.replaceChildren(h("h3", {}, "Playtests on this computer"), ...list.map(row)),
        () => sessions.replaceChildren(h("p", { class: "notice warn" }, "This browser won't let Flinch store playtests (a private window?). You can still record; download each one before closing.")),
      );

    root.append(
      h("main", { class: "home" },
        h("header", { class: "brand" },
          h("h1", {}, "Flinch"),
          h("p", { class: "tagline" }, "Your playtester won't tell you. Their face will."),
        ),
        ok
          ? h("button", { class: "primary big", id: "new-playtest", onclick: () => show(setupScreen()) }, "New playtest")
          : h("p", { class: "notice warn", id: "unsupported" }, "Flinch needs desktop Chrome or Edge: it uses screen recording and camera features other browsers don't have yet."),
        sessions,
        h("ol", { class: "steps" },
          h("li", {}, h("b", {}, "Pick the game window"), " — any game: a browser tab, a Unity build, an emulator."),
          h("li", {}, h("b", {}, "Turn on the camera"), " — Flinch learns your tester's resting face in ten seconds."),
          h("li", {}, h("b", {}, "Play, then Stop"), " — the moments they flinched, groaned or grinned come back pinned."),
        ),
        h("p", { class: "privacy" }, "Nothing leaves this computer. Recordings and face data stay in this browser."),
      ),
    );
  };
}
