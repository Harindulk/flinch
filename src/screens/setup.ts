import { h } from "../dom";
import { CaptureError, openCamera, pickWindow, stopStream } from "../capture";
import { show, type Screen } from "../nav";
import { homeScreen } from "./home";
import { recordScreen } from "./record";

export function setupScreen(): Screen {
  return (root) => {
    let game: MediaStream | null = null;
    let cam: MediaStream | null = null;
    let handedOff = false;

    const tester = h("input", { id: "tester", placeholder: "e.g. Kasun", maxLength: 40, autocomplete: "off" });
    const build = h("input", { id: "build", placeholder: "e.g. Drive Away 0.9", maxLength: 60, autocomplete: "off" });
    const consent = h("input", { type: "checkbox", id: "consent" });
    const start = h("button", { class: "primary big", id: "calibrate", disabled: true }, "Calibrate and start");

    const tile = (id: string, title: string, button: string, muted: boolean, hint: string) => {
      const video = h("video", { autoplay: true, muted: true, playsInline: true });
      const msg = h("p", { class: "tile-msg" }, hint);
      const btn = h("button", { class: "secondary", id: `${id}-btn` }, button);
      const box = h("section", { class: "tile empty", id }, h("h3", {}, title), h("div", { class: "frame" }, video, msg), btn);
      if (muted) video.muted = true;
      return { box, video, msg, btn, hint };
    };
    const gameTile = tile("game-tile", "Game", "Choose game window", true,
      "Open your game first, then pick its window. Tick “Share audio” if Chrome offers it, so the reel has the game's sound.");
    const camTile = tile("cam-tile", "Tester", "Turn on camera & mic", true, "The tester's face and voice. Sit them facing a light.");
    camTile.video.classList.add("mirror");

    const refresh = () => {
      start.disabled = !(game && cam && consent.checked);
    };

    const attach = (t: typeof gameTile, s: MediaStream | null, err?: unknown) => {
      t.video.srcObject = s;
      t.box.classList.toggle("empty", !s);
      t.box.classList.toggle("error", Boolean(err));
      t.msg.textContent = err ? (err instanceof CaptureError ? err.message : String(err)) : t.hint;
      refresh();
    };

    gameTile.btn.onclick = async () => {
      try {
        stopStream(game);
        game = await pickWindow();
        game.getVideoTracks()[0].addEventListener("ended", () => {
          game = null;
          attach(gameTile, null);
          gameTile.btn.textContent = "Choose game window";
        });
        gameTile.btn.textContent = "Choose a different window";
        attach(gameTile, game);
      } catch (e) {
        game = null;
        attach(gameTile, null, e);
      }
    };
    camTile.btn.onclick = async () => {
      try {
        stopStream(cam);
        cam = await openCamera();
        camTile.btn.textContent = "Camera on";
        camTile.btn.disabled = true;
        attach(camTile, cam);
      } catch (e) {
        cam = null;
        attach(camTile, null, e);
      }
    };
    consent.onchange = refresh;
    start.onclick = () => {
      handedOff = true;
      show(recordScreen({ game: game!, cam: cam!, tester: tester.value.trim() || "Tester", build: build.value.trim() || "Untitled build" }));
    };

    root.append(
      h("main", { class: "setup" },
        h("header", { class: "bar" },
          h("button", { class: "ghost", onclick: () => show(homeScreen()) }, "← Back"),
          h("h2", {}, "New playtest"),
        ),
        h("div", { class: "tiles" }, gameTile.box, camTile.box),
        h("div", { class: "fields" },
          h("label", {}, "Tester's first name", tester),
          h("label", {}, "Build", build),
        ),
        h("label", { class: "consent" }, consent, h("span", {}, "I'm the tester and I agree to be recorded. The recording stays on this computer.")),
        start,
      ),
    );

    return () => {
      if (!handedOff) {
        stopStream(game);
        stopStream(cam);
      }
    };
  };
}
