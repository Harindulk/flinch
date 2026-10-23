import { h } from "../dom";
import { browserSupported } from "../capture";
import { show, type Screen } from "../nav";
import { setupScreen } from "./setup";

export function homeScreen(): Screen {
  return (root) => {
    const ok = browserSupported();
    root.append(
      h("main", { class: "home" },
        h("header", { class: "brand" },
          h("h1", {}, "Flinch"),
          h("p", { class: "tagline" }, "Your playtester won't tell you. Their face will."),
        ),
        ok
          ? h("button", { class: "primary big", id: "new-playtest", onclick: () => show(setupScreen()) }, "New playtest")
          : h("p", { class: "notice warn", id: "unsupported" }, "Flinch needs desktop Chrome or Edge: it uses screen recording and camera features other browsers don't have yet."),
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
