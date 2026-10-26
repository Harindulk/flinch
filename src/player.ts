import { h } from "./dom";

/** MediaRecorder WebM files have no duration or seek index; seeking to the end once makes Chrome build both. */
export function loadVideo(video: HTMLVideoElement, blob: Blob): Promise<void> {
  video.src = URL.createObjectURL(blob);
  return new Promise((resolve) => {
    let done = false;
    const ready = () => {
      if (done) return;
      done = true;
      video.removeEventListener("durationchange", onDuration);
      video.currentTime = 0;
      resolve();
    };
    setTimeout(ready, 8000); // never leave the screen waiting on a stubborn file
    const onDuration = () => Number.isFinite(video.duration) && ready();
    video.addEventListener("loadedmetadata", () => {
      if (Number.isFinite(video.duration)) return ready();
      video.addEventListener("durationchange", onDuration);
      video.currentTime = 1e9;
    }, { once: true });
    video.addEventListener("error", ready, { once: true });
  });
}

export function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - t) < 0.01) return resolve();
    video.addEventListener("seeked", () => resolve(), { once: true });
    video.currentTime = t;
  });
}

const failed = (v: HTMLVideoElement) => !!v.error || v.readyState < HTMLMediaElement.HAVE_METADATA;

/** The game recording with the face recording kept in sync in its corner. */
export class Player {
  readonly game = h("video", { playsInline: true, class: "game" });
  readonly face = h("video", { playsInline: true, class: "face mirror" });
  readonly msg = h("div", { class: "stage-msg", role: "status" }, "Loading the recordings…");
  readonly el = h("div", { class: "stage" }, this.game, this.face, this.msg);
  /** False until both files are loaded; seeking earlier would upset loadVideo's seek-to-end. */
  ready = false;
  gameFailed = false;
  faceFailed = false;
  private sync = 0;

  constructor(readonly duration: number) {}

  async load(game: Blob, face: Blob) {
    try {
      await Promise.all([loadVideo(this.game, game), loadVideo(this.face, face)]);
    } catch {
      // A missing blob throws in createObjectURL; the checks below report it.
    }
    this.ready = true;
    this.gameFailed = failed(this.game);
    this.faceFailed = failed(this.face);
    this.face.hidden = this.faceFailed;
    this.msg.hidden = !this.gameFailed && !this.faceFailed;
    this.msg.classList.toggle("corner", !this.gameFailed);
    this.msg.textContent = this.gameFailed && this.faceFailed
      ? "Neither recording plays in this browser. Notes and exports still work: download the recording and open it in Chrome or VLC."
      : this.gameFailed
        ? "The game recording doesn't play in this browser, so replay is off. Notes and exports still work: download the recording and open it in Chrome or VLC."
        : "The face recording doesn't play here. The game still replays.";
    if (this.gameFailed || this.faceFailed) return;
    // Sync only after both have loaded: loadVideo's seek-to-end on one must not reach the other.
    this.game.onplay = () => this.inFace() && this.face.play().catch(() => {});
    this.game.onpause = () => this.face.pause();
    this.game.onseeking = () => this.inFace() && (this.face.currentTime = this.game.currentTime);
    this.sync = window.setInterval(() => this.keepInSync(), 250);
  }

  /** The face file can end a moment before the game file; play() on an ended video restarts it from 0. */
  private inFace() {
    return !(this.face.duration < this.game.currentTime);
  }

  /** Small drift is eased out with the face's playback rate; big drift (a stall, a long replay) is a hard seek. */
  private keepInSync() {
    const g = this.game, f = this.face;
    const drift = f.currentTime - g.currentTime;
    if (g.paused || !this.inFace()) {
      if (!f.paused) f.pause();
      f.playbackRate = g.playbackRate;
      if (this.inFace() && Math.abs(drift) > 0.05 && !f.seeking) f.currentTime = g.currentTime;
      return;
    }
    if (f.paused && !g.seeking) f.play().catch(() => {});
    if (Math.abs(drift) > 0.25) {
      f.playbackRate = g.playbackRate;
      if (!f.seeking) f.currentTime = g.currentTime;
    } else f.playbackRate = g.playbackRate * (Math.abs(drift) > 0.04 ? (drift > 0 ? 0.95 : 1.05) : 1);
  }

  get time() {
    return this.game.currentTime;
  }

  seek(t: number) {
    if (!this.ready || this.gameFailed) return;
    this.game.currentTime = Math.max(0, Math.min(t, this.duration));
  }

  toggle() {
    if (!this.ready || this.gameFailed) return;
    if (this.game.paused) this.game.play().catch(() => {});
    else this.game.pause();
  }

  destroy() {
    clearInterval(this.sync);
    for (const v of [this.game, this.face]) {
      v.pause();
      URL.revokeObjectURL(v.src);
      v.removeAttribute("src");
      v.load();
    }
  }
}
