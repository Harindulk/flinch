import { h } from "../dom";
import { timecode } from "../format";
import { show, type Screen } from "../nav";
import { Player } from "../player";
import type { Session, Videos } from "../types";
import { homeScreen } from "./home";

export function reviewScreen(session: Session, videos: Videos): Screen {
  return (root) => {
    const player = new Player(session.duration);
    const playBtn = h("button", { class: "secondary", id: "play" }, "Play");
    const clock = h("span", { class: "clock mono", id: "review-clock" }, `0:00 / ${timecode(session.duration)}`);
    player.game.ontimeupdate = () => (clock.textContent = `${timecode(player.time)} / ${timecode(session.duration)}`);
    player.game.addEventListener("play", () => (playBtn.textContent = "Pause"));
    player.game.addEventListener("pause", () => (playBtn.textContent = "Play"));
    playBtn.onclick = () => player.toggle();

    root.append(
      h("main", { class: "review", id: "review" },
        h("header", { class: "bar" },
          h("button", { class: "ghost", onclick: () => show(homeScreen()) }, "← Playtests"),
          h("h2", {}, `${session.tester} · ${session.build}`),
        ),
        h("div", { class: "review-body" },
          h("section", { class: "viewer" }, player.el, h("div", { class: "transport" }, playBtn, clock)),
        ),
      ),
    );
    player.load(videos.game, videos.face).then(() => root.querySelector("#review")?.setAttribute("data-ready", "1"));

    return () => player.destroy();
  };
}
