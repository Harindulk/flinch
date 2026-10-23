import { h } from "../dom";
import { stopStream } from "../capture";
import { timecode, uid } from "../format";
import { show, type Screen } from "../nav";
import { SessionRecorder } from "../recorder";
import type { Session } from "../types";
import { reviewScreen } from "./review";

export type RecordCtx = { game: MediaStream; cam: MediaStream; tester: string; build: string };

export function recordScreen(ctx: RecordCtx): Screen {
  return (root) => {
    const gameVideo = h("video", { autoplay: true, muted: true, playsInline: true, class: "game" });
    const faceVideo = h("video", { autoplay: true, muted: true, playsInline: true, class: "face mirror" });
    gameVideo.srcObject = ctx.game;
    faceVideo.srcObject = ctx.cam;

    const clock = h("span", { class: "clock mono", id: "clock" }, "0:00");
    const stopBtn = h("button", { class: "danger", id: "stop" }, "Stop");
    const status = h("span", { class: "rec-status", id: "rec-status" }, h("i", { class: "rec-dot" }), "Recording");

    root.append(
      h("main", { class: "record" },
        h("header", { class: "bar" }, status, clock, h("span", { class: "who" }, `${ctx.tester} · ${ctx.build}`), h("span", { class: "spacer" }), stopBtn),
        h("div", { class: "stage" }, gameVideo, faceVideo),
      ),
    );

    const rec = new SessionRecorder(ctx.game, ctx.cam);
    rec.start();
    const tick = setInterval(() => (clock.textContent = timecode(rec.elapsed())), 250);

    let stopping = false;
    const finish = async () => {
      if (stopping) return;
      stopping = true;
      clearInterval(tick);
      stopBtn.disabled = true;
      status.textContent = "Saving…";
      const recording = await rec.stop();
      stopStream(ctx.game);
      stopStream(ctx.cam);
      const session: Session = {
        id: uid(),
        tester: ctx.tester,
        build: ctx.build,
        createdAt: Date.now(),
        duration: recording.duration,
        mimeType: recording.mimeType,
        samples: [],
        moments: [],
      };
      show(reviewScreen(session, { game: recording.game, face: recording.face }));
    };
    stopBtn.onclick = finish;
    // Stopping the share from Chrome's own bar ends the session instead of losing it.
    ctx.game.getVideoTracks()[0]?.addEventListener("ended", finish);
    ctx.cam.getVideoTracks()[0]?.addEventListener("ended", finish);

    return () => {
      clearInterval(tick);
      if (!stopping) {
        stopStream(ctx.game);
        stopStream(ctx.cam);
      }
    };
  };
}
