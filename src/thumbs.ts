import { h } from "./dom";
import { loadVideo, seekTo } from "./player";
import type { Moment, Videos } from "./types";

/** Paints the game frame with the face in its corner, like the review stage. */
export function paintFrame(g: CanvasRenderingContext2D, game: HTMLVideoElement, face: HTMLVideoElement, w: number, hgt: number) {
  g.fillStyle = "#000";
  g.fillRect(0, 0, w, hgt);
  const s = Math.min(w / (game.videoWidth || 16), hgt / (game.videoHeight || 9));
  const gw = (game.videoWidth || 16) * s, gh = (game.videoHeight || 9) * s;
  g.drawImage(game, (w - gw) / 2, (hgt - gh) / 2, gw, gh);
  const fw = w * 0.22, fh = fw * 0.75, fx = w - fw - w * 0.025, fy = hgt - fh - hgt * 0.04, r = fw * 0.06;
  g.save();
  g.beginPath();
  g.roundRect(fx, fy, fw, fh, r);
  g.clip();
  // Cover-fit the face and mirror it, like a selfie view.
  const fs = Math.max(fw / (face.videoWidth || 4), fh / (face.videoHeight || 3));
  const vw = (face.videoWidth || 4) * fs, vh = (face.videoHeight || 3) * fs;
  g.translate(fx + fw, fy);
  g.scale(-1, 1);
  g.drawImage(face, (fw - vw) / 2, (fh - vh) / 2, vw, vh);
  g.restore();
  g.strokeStyle = "rgba(255,255,255,0.85)";
  g.lineWidth = Math.max(1, w / 400);
  g.beginPath();
  g.roundRect(fx, fy, fw, fh, r);
  g.stroke();
}

/** Small JPEG thumbnails for each moment, taken from the recordings. Missing frames just leave no thumbnail. */
export async function addThumbs(moments: Moment[], videos: Videos): Promise<void> {
  if (!moments.length) return;
  const game = h("video", { muted: true, playsInline: true });
  const face = h("video", { muted: true, playsInline: true });
  const cv = h("canvas", { width: 320, height: 180 });
  const g = cv.getContext("2d")!;
  try {
    await Promise.all([loadVideo(game, videos.game), loadVideo(face, videos.face)]);
    for (const m of moments) {
      await Promise.all([seekTo(game, Math.min(m.t, game.duration - 0.05)), seekTo(face, Math.min(m.t, face.duration - 0.05))]);
      paintFrame(g, game, face, cv.width, cv.height);
      m.thumb = cv.toDataURL("image/jpeg", 0.7);
    }
  } catch {
    // Thumbnails are nice to have; the moments still work without them.
  } finally {
    for (const v of [game, face]) {
      URL.revokeObjectURL(v.src);
      v.removeAttribute("src");
      v.load(); // releases the decoder right away
    }
  }
}
