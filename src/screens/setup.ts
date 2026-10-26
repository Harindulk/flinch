import { h } from "../dom";
import { CaptureError, openCamera, pickWindow, stopStream } from "../capture";
import { icon, type IconName } from "../icons";
import { show, type Screen } from "../nav";
import { warmFaceModel } from "../face";
import { homeScreen } from "./home";
import { recordScreen } from "./record";
import "../setup.css";

export function setupScreen(prefill: { tester?: string; build?: string } = {}): Screen {
  return (root) => {
    let game: MediaStream | null = null;
    let cam: MediaStream | null = null;
    let handedOff = false;

    const tester = h("input", { id: "tester", placeholder: "e.g. Kasun", maxLength: 40, autocomplete: "off", value: prefill.tester ?? "" });
    const build = h("input", { id: "build", placeholder: "e.g. Drive Away 0.9", maxLength: 60, autocomplete: "off", value: prefill.build ?? "" });
    const consent = h("input", { type: "checkbox", id: "consent" });
    const start = h("button", { class: "primary big", id: "calibrate", disabled: true }, "Calibrate and start");
    const missing = h("p", { class: "missing", id: "missing", role: "status" });
    const consentNum = h("span", { class: "num" }, "3");

    const tile = (n: number, id: string, title: string, ico: IconName, button: string, hint: string) => {
      const video = h("video", { autoplay: true, muted: true, playsInline: true });
      const msg = h("p", { class: "tile-msg" }, hint);
      const btn = h("button", { class: "secondary", id: `${id}-btn` }, icon(ico), button);
      const num = h("span", { class: "num" }, String(n));
      const note = h("p", { class: "tile-note", role: "status" });
      const box = h("section", { class: "tile empty", id }, h("h2", { class: "label" }, num, title), h("div", { class: "frame" }, video, msg), note, btn);
      return { box, video, msg, btn, hint, num, n, note };
    };
    const gameTile = tile(1, "game-tile", "Game window", "monitor", "Choose game window",
      "Open your game first, then pick its window. Tick “Share audio” if Chrome offers it, so the reel has the game's sound.");
    const camTile = tile(2, "cam-tile", "Tester camera", "camera", "Turn on camera & mic", "The tester's face and voice. Sit them facing a light, about an arm's length away.");
    camTile.video.classList.add("mirror");

    const done = (t: typeof gameTile, ok: boolean) => t.num.replaceChildren(ok ? icon("check") : String(t.n));

    const refresh = () => {
      start.disabled = !(game && cam && consent.checked);
      consentNum.replaceChildren(consent.checked ? icon("check") : "3");
      const todo = [!game && "choose the game window", !cam && "turn on the camera", !consent.checked && "tick the tester's consent"].filter(Boolean);
      missing.textContent = todo.length ? `To start: ${todo.join(", ")}.` : "Ready. Calibration takes ten seconds, then recording starts.";
      missing.classList.toggle("ready", !todo.length);
    };

    const note = (t: typeof gameTile, text: string, warn = false) => {
      t.note.textContent = text;
      t.note.classList.toggle("warn", warn);
    };

    const attach = (t: typeof gameTile, s: MediaStream | null, err?: unknown) => {
      t.video.srcObject = s;
      t.box.classList.toggle("empty", !s);
      t.box.classList.toggle("error", Boolean(err));
      t.box.classList.toggle("ok", Boolean(s));
      t.msg.textContent = err ? (err instanceof CaptureError || err instanceof Error ? err.message : "Something went wrong opening it. Try again.") : t.hint;
      t.note.textContent = "";
      t.note.classList.remove("warn");
      done(t, Boolean(s));
      refresh();
    };

    gameTile.btn.onclick = async () => {
      let next: MediaStream;
      try {
        next = await pickWindow();
      } catch (e) {
        // A cancelled re-pick keeps the window that was already shared.
        if (game) return note(gameTile, `${(e as Error).message} The window you shared before is still in use.`, true);
        return attach(gameTile, null, e);
      }
      stopStream(game);
      game = next;
      const track = game.getVideoTracks()[0];
      track.addEventListener("ended", () => {
        if (game?.getVideoTracks()[0] !== track) return;
        game = null;
        attach(gameTile, null, new Error("Sharing stopped. Click Choose game window to share it again."));
        gameTile.btn.replaceChildren(icon("monitor"), "Choose game window");
      });
      gameTile.btn.replaceChildren(icon("monitor"), "Choose a different window");
      attach(gameTile, game);
      const surface = track.getSettings().displaySurface;
      const silent = game.getAudioTracks().length ? "" : " No game sound came with it, so recordings and the reel will be silent on the game's side (Chrome shares sound from tabs, and on Windows from a whole screen).";
      if (surface === "monitor")
        note(gameTile, `You shared a whole screen. It works, but the recording shows everything on it, Flinch included. For a clean recording, click Choose a different window and pick just the game.${silent}`, true);
      else if (silent) note(gameTile, silent.trim());
    };
    camTile.btn.onclick = async () => {
      let next: MediaStream;
      try {
        next = await openCamera();
      } catch (e) {
        if (cam) return note(camTile, `${(e as Error).message} The camera you turned on before is still in use.`, true);
        return attach(camTile, null, e);
      }
      stopStream(cam);
      cam = next;
      const track = cam.getVideoTracks()[0];
      track.addEventListener("ended", () => {
        if (cam?.getVideoTracks()[0] !== track) return;
        cam = null;
        camTile.btn.disabled = false;
        camTile.btn.replaceChildren(icon("camera"), "Turn on camera & mic");
        attach(camTile, null, new Error("The camera disconnected. Plug it back in and turn it on again."));
      });
      const mic = cam.getAudioTracks().length > 0;
      camTile.btn.replaceChildren(icon(mic ? "check" : "camera"), mic ? "Camera and mic on" : "Camera on, try the mic again");
      camTile.btn.disabled = mic;
      attach(camTile, cam);
      if (!mic) {
        const blocked = await navigator.permissions?.query({ name: "microphone" as PermissionName }).then((p) => p.state === "denied", () => false);
        note(camTile, (blocked
          ? "The microphone is blocked, so Flinch carries on without it. To add it, allow Microphone in Chrome's site settings (icon at the left of the address bar), then click the button below. "
          : "No microphone found, so Flinch carries on without it. ") +
          "Expressions are still read; what you lose is the tester's voice in the recording, and laughs or groans won't strengthen a moment.", true);
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
          h("button", { class: "ghost", onclick: () => show(homeScreen()) }, icon("back"), "Back"),
          h("h1", {}, "New playtest"),
        ),
        h("div", { class: "tiles" }, gameTile.box, camTile.box),
        h("section", { class: "tile details" },
          h("h2", { class: "label" }, consentNum, "Tester and consent"),
          h("div", { class: "fields" },
            h("label", {}, "Tester's first name", tester),
            h("label", {}, "Build", build),
          ),
          h("label", { class: "consent" }, consent, h("span", {}, "I'm the tester and I agree to be recorded. The recording stays on this computer.")),
        ),
        h("div", { class: "start-row" }, start, missing),
      ),
    );
    refresh();
    warmFaceModel();

    return () => {
      if (!handedOff) {
        stopStream(game);
        stopStream(cam);
      }
    };
  };
}
