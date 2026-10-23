import { download, h } from "../dom";
import { slug, timecode } from "../format";
import { THRESHOLD } from "../moments";
import { show, type Screen } from "../nav";
import { Player } from "../player";
import { drawTimeline, timeAt } from "../timeline";
import type { Moment, Session, Videos } from "../types";
import { keptMoments, makeReel, notesMarkdown } from "../export";
import { updateSession } from "../store";
import { homeScreen } from "./home";

const LEAD_IN = 3; // jump to a little before the moment, so you see what led to it
const LABEL = { frustration: "Frustration", delight: "Delight", mark: "Marked" } as const;

export function reviewScreen(session: Session, videos: Videos, opts: { unsaved?: boolean } = {}): Screen {
  return (root) => {
    const player = new Player(session.duration);
    let selected: string | null = null;
    let raf = 0;

    const playBtn = h("button", { class: "secondary", id: "play" }, "Play");
    const clock = h("span", { class: "clock mono", id: "review-clock" }, `0:00 / ${timecode(session.duration)}`);
    const timeline = h("canvas", { class: "timeline", id: "timeline", title: "Click to jump" });
    const list = h("section", { class: "moments", id: "moments" });

    const redraw = () => {
      clock.textContent = `${timecode(player.time)} / ${timecode(session.duration)}`;
      drawTimeline(timeline, session.samples, { from: 0, to: session.duration, moments: session.moments, playhead: player.time, selected, threshold: THRESHOLD });
    };
    const loop = () => {
      redraw();
      raf = requestAnimationFrame(loop);
    };
    player.game.addEventListener("play", () => {
      playBtn.textContent = "Pause";
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    });
    player.game.addEventListener("pause", () => {
      playBtn.textContent = "Play";
      cancelAnimationFrame(raf);
      redraw();
    });
    player.game.addEventListener("seeked", redraw);
    playBtn.onclick = () => player.toggle();

    const select = (m: Moment, play = true) => {
      selected = m.id;
      player.seek(m.t - LEAD_IN);
      if (play) player.game.play().catch(() => {});
      for (const row of list.querySelectorAll<HTMLElement>(".moment")) row.classList.toggle("selected", row.dataset.id === m.id);
      list.querySelector<HTMLElement>(`[data-id="${m.id}"]`)?.scrollIntoView({ block: "nearest" });
      redraw();
    };

    timeline.onclick = (e) => {
      const t = timeAt(timeline, e.clientX, 0, session.duration);
      const px = timeline.clientWidth / Math.max(session.duration, 1);
      const near = session.moments.find((m) => Math.abs(m.t - t) * px < 8);
      if (near) select(near);
      else player.seek(t);
    };

    const row = (m: Moment) => {
      const note = h("textarea", { placeholder: "What happened here? e.g. jump too far", value: m.note, rows: 1 });
      const dismiss = h("button", { class: "ghost" }, m.dismissed ? "Restore" : "Not a reaction");
      const el = h("article", { class: `moment ${m.kind}${m.dismissed ? " dismissed" : ""}`, dataset: { id: m.id, kind: m.kind } },
        m.thumb ? h("img", { src: m.thumb, alt: `Frame at ${timecode(m.t)}` }) : h("img", { alt: "" }),
        h("div", {},
          h("div", { class: "head" }, h("span", { class: "kind" }, LABEL[m.kind]), h("span", { class: "mono" }, timecode(m.t)),
            m.kind === "mark" ? null : h("span", { class: "x mono" }, `${m.strength.toFixed(1)}×`)),
          m.kind === "mark"
            ? h("div", { class: "meta progress" }, "Marked during play")
            : h("div", { class: "strength", title: `${m.strength.toFixed(1)}× above resting face` }, h("i", { style: `width:${Math.min(100, (m.strength / 10) * 100)}%` })),
        ),
        note,
        h("div", { class: "actions" }, dismiss),
      );
      el.tabIndex = 0;
      el.setAttribute("aria-label", `${LABEL[m.kind]} at ${timecode(m.t)}: press Enter to replay`);
      el.onclick = (e) => {
        if (e.target === note || e.target === dismiss) return;
        select(m);
      };
      el.onkeydown = (e) => {
        if (e.key === "Enter" && e.target === el) select(m);
      };
      note.oninput = () => {
        m.note = note.value;
        onChange(m);
      };
      dismiss.onclick = () => {
        m.dismissed = !m.dismissed;
        el.classList.toggle("dismissed", m.dismissed);
        dismiss.textContent = m.dismissed ? "Restore" : "Not a reaction";
        onChange(m);
        redraw();
      };
      return el;
    };

    let saveTimer = 0;
    const onChange = (_m: Moment) => {
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => updateSession(session).catch(() => {}), 300);
    };
    const fileBase = `flinch-${slug(session.tester)}-${slug(session.build)}-${new Date(session.createdAt).toISOString().slice(0, 10)}`;
    const ext = session.mimeType.includes("mp4") ? "mp4" : "webm";
    const downloadRecording = () => {
      download(videos.game, `${fileBase}-game.${ext}`);
      setTimeout(() => download(videos.face, `${fileBase}-face.${ext}`), 400);
    };
    const progress = h("span", { class: "progress", id: "reel-progress" });
    const reelBtn = h("button", { class: "primary", id: "make-reel" }, "Make highlight reel");
    reelBtn.onclick = async () => {
      if (!keptMoments(session).length) {
        progress.textContent = "No moments to put in a reel. Mark one, or restore a dismissed one.";
        return;
      }
      reelBtn.disabled = true;
      player.game.pause();
      try {
        const reel = await makeReel(session, videos, (done, total) => {
          progress.textContent = done < total ? `Recording the reel… moment ${done + 1} of ${total}. Keep this tab open.` : "Finishing…";
        });
        download(reel, `${fileBase}-reel.${reel.type.includes("mp4") ? "mp4" : "webm"}`);
        progress.textContent = "Reel downloaded.";
      } catch (e) {
        progress.textContent = `The reel failed: ${(e as Error).message}`;
      } finally {
        reelBtn.disabled = false;
      }
    };
    const exports = h("div", { class: "exports" },
      h("button", { class: "secondary", id: "download-notes", onclick: () => download(new Blob([notesMarkdown(session)], { type: "text/markdown" }), `${fileBase}-notes.md`) }, "Download notes"),
      h("button", { class: "secondary", id: "download-recording", onclick: downloadRecording }, "Download recording"),
      reelBtn,
    );
    const unsavedBanner = opts.unsaved
      ? h("div", { class: "notice error banner", id: "unsaved" },
          "This browser couldn't save the playtest (storage full, or a private window). Download it now so it isn't lost. ",
          h("button", { class: "danger", onclick: downloadRecording }, "Download recording"))
      : null;

    const renderList = () => {
      const kept = session.moments.filter((m) => m.kind !== "mark");
      list.replaceChildren(
        h("h3", {}, `Moments · ${session.moments.length}`),
        ...(kept.length ? [] : [h("p", { class: "empty", id: "no-moments" }, "No big reactions this time. Either the game ran smooth, or your tester has a poker face. The timeline below still shows every wobble.")]),
        ...session.moments.map(row),
      );
    };
    renderList();

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === " ") {
        e.preventDefault();
        player.toggle();
      } else if (e.key === "n" || e.key === "p") {
        const ms = session.moments;
        const i = ms.findIndex((m) => m.id === selected);
        const next = e.key === "n" ? ms[i + 1] ?? ms[0] : ms[i - 1] ?? ms[ms.length - 1];
        if (next) select(next);
      }
    };
    addEventListener("keydown", onKey);
    addEventListener("resize", redraw);

    root.append(
      h("main", { class: "review", id: "review", dataset: { samples: String(session.samples.length), faces: String(session.samples.filter((x) => x.face).length) } },
        h("header", { class: "bar" },
          h("button", { class: "ghost", onclick: () => show(homeScreen()) }, "← Playtests"),
          h("h2", {}, `${session.tester} · ${session.build}`),
          h("span", { class: "who" }, new Date(session.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })),
          h("span", { class: "spacer" }),
          progress,
          exports,
        ),
        unsavedBanner,
        h("div", { class: "review-body" },
          h("section", { class: "viewer" },
            player.el,
            h("div", { class: "transport" }, playBtn, clock, h("span", { class: "spacer" }),
              h("span", { class: "legend" },
                h("span", {}, h("i", { style: "background:var(--frus)" }), "Frustration"),
                h("span", {}, h("i", { style: "background:var(--joy)" }), "Delight"),
                h("span", {}, h("i", { style: "background:var(--mark)" }), "Marked"),
              ),
            ),
            timeline,
            h("p", { class: "hint" }, "Click a pin or a moment to replay it from 3 seconds before. Space plays and pauses; N and P jump between moments."),
          ),
          list,
        ),
      ),
    );
    redraw();
    player.load(videos.game, videos.face).then(() => {
      root.querySelector("#review")?.setAttribute("data-ready", "1");
      redraw();
    });

    return () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        updateSession(session).catch(() => {});
      }
      cancelAnimationFrame(raf);
      removeEventListener("keydown", onKey);
      removeEventListener("resize", redraw);
      player.destroy();
    };
  };
}
