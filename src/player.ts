import { h } from "./dom";

/** MediaRecorder WebM files have no duration or seek index; seeking to the end once makes Chrome build both. */
export function loadVideo(video: HTMLVideoElement, blob: Blob): Promise<void> {
  video.src = URL.createObjectURL(blob);
  return new Promise((resolve) => {
    const ready = () => {
      video.removeEventListener("durationchange", onDuration);
      video.currentTime = 0;
      resolve();
    };
    const onDuration = () => Number.isFinite(video.duration) && ready();
    video.addEventListener("loadedmetadata", () => {
      if (Number.isFinite(video.duration)) return ready();
      video.addEventListener("durationchange", onDuration);
      video.currentTime = 1e9;
    }, { once: true });
    video.addEventListener("error", () => resolve(), { once: true });
  });
}

export function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - t) < 0.01) return resolve();
    video.addEventListener("seeked", () => resolve(), { once: true });
    video.currentTime = t;
  });
}

/** The game recording with the face recording kept in sync in its corner. */
export class Player {
  readonly game = h("video", { playsInline: true, class: "game" });
  readonly face = h("video", { playsInline: true, class: "face mirror" });
  readonly el = h("div", { class: "stage" }, this.game, this.face);
  private sync = 0;

  constructor(readonly duration: number) {
    this.game.onplay = () => this.face.play().catch(() => {});
    this.game.onpause = () => this.face.pause();
    this.game.onseeking = () => (this.face.currentTime = this.game.currentTime);
    this.sync = window.setInterval(() => {
      if (Math.abs(this.face.currentTime - this.game.currentTime) > 0.15) this.face.currentTime = this.game.currentTime;
    }, 500);
  }

  async load(game: Blob, face: Blob) {
    await Promise.all([loadVideo(this.game, game), loadVideo(this.face, face)]);
  }

  get time() {
    return this.game.currentTime;
  }

  seek(t: number) {
    this.game.currentTime = Math.max(0, Math.min(t, this.duration));
  }

  toggle() {
    if (this.game.paused) this.game.play().catch(() => {});
    else this.game.pause();
  }

  destroy() {
    clearInterval(this.sync);
    for (const v of [this.game, this.face]) {
      v.pause();
      URL.revokeObjectURL(v.src);
      v.removeAttribute("src");
    }
  }
}
