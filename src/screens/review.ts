import { download, h } from "../dom";
import { slug, timecode } from "../format";
import { icon } from "../icons";
import { KIND_LABEL, MEASURE_NOTE, SIGNAL_LABEL, STRENGTH_TIP, strengthText } from "../labels";
import { THRESHOLD } from "../moments";
import { show, type Screen } from "../nav";
import { Player } from "../player";
import { drawTimeline, timeAt } from "../timeline";
import type { Moment, Session, Videos } from "../types";
import { keptMoments, makeReel, notesMarkdown } from "../export";
import { updateSession } from "../store";
import { homeScreen } from "./home";

const LEAD_IN = 3; // jump to a little before the moment, so you see what led to it
const PIN_HIT_PX = 10;

export function reviewScreen(session: Session, videos: Videos, opts: { unsaved?: boolean; fresh?: boolean } = {}): Screen {
  return (root) => {
    const player = new Player(session.duration);
    let selected: string | null = null;
    let hoverT: number | null = null;
    let raf = 0;
    const strongest = session.moments.filter((m) => m.kind !== "mark").sort((a, b) => b.strength - a.strength)[0];

    const playBtn = h("button", { class: "icon-btn primary", id: "play", ariaLabel: "Play" }, icon("play"));
    const prevBtn = h("button", { class: "icon-btn", id: "prev-moment", ariaLabel: "Previous moment (P)", title: "Previous moment (P)" }, icon("prev"));
    const nextBtn = h("button", { class: "icon-btn", id: "next-moment", ariaLabel: "Next moment (N)", title: "Next moment (N)" }, icon("next"));
    const clock = h("span", { class: "clock mono", id: "review-clock" }, `0:00 / ${timecode(session.duration)}`);
    const timeline = h("canvas", { class: "timeline", id: "timeline", role: "img", ariaLabel: "Reaction timeline. Use the moments list to replay a moment." });
    const tip = h("div", { class: "tip mono", hidden: true });
    const list = h("section", { class: "moments", id: "moments", ariaLabel: "Moments" });

    const redraw = () => {
      clock.textContent = `${timecode(player.time)} / ${timecode(session.duration)}`;
      drawTimeline(timeline, session.samples, { from: 0, to: session.duration, moments: session.moments, playhead: player.time, selected, threshold: THRESHOLD, hover: hoverT ?? undefined });
    };
    const loop = () => {
      redraw();
      raf = requestAnimationFrame(loop);
    };
    player.game.addEventListener("play", () => {
      playBtn.replaceChildren(icon("pause"));
      playBtn.ariaLabel = "Pause";
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    });
    player.game.addEventListener("pause", () => {
      playBtn.replaceChildren(icon("play"));
      playBtn.ariaLabel = "Play";
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
    const step = (dir: 1 | -1) => {
      const ms = session.moments;
      if (!ms.length) return;
      const i = ms.findIndex((m) => m.id === selected);
      select(dir === 1 ? ms[i + 1] ?? ms[0] : ms[i - 1] ?? ms[ms.length - 1]);
    };
    prevBtn.onclick = () => step(-1);
    nextBtn.onclick = () => step(1);
    prevBtn.disabled = nextBtn.disabled = !session.moments.length;

    const pinNear = (clientX: number) => {
      const t = timeAt(timeline, clientX, 0, session.duration);
      const px = timeline.clientWidth / Math.max(session.duration, 1);
      return { t, pin: session.moments.find((m) => Math.abs(m.t - t) * px < PIN_HIT_PX) };
    };
    timeline.onclick = (e) => {
      const { t, pin } = pinNear(e.clientX);
      if (pin) select(pin);
      else player.seek(t);
    };
    timeline.onmousemove = (e) => {
      const { t, pin } = pinNear(e.clientX);
      hoverT = pin ? pin.t : t;
      timeline.style.cursor = pin ? "pointer" : "col-resize";
      tip.hidden = false;
      tip.textContent = pin ? `${timecode(pin.t)} · ${KIND_LABEL[pin.kind]} — click to replay` : timecode(t);
      const r = timeline.getBoundingClientRect();
      tip.style.left = `${Math.min(Math.max(e.clientX - r.left, 60), r.width - 60)}px`;
      redraw();
    };
    timeline.onmouseleave = () => {
      hoverT = null;
      tip.hidden = true;
      redraw();
    };

    const row = (m: Moment) => {
      const note = h("textarea", { placeholder: "What happened here? e.g. jump too far", value: m.note, rows: 1, ariaLabel: `Note for ${timecode(m.t)}` });
      const dismiss = h("button", { class: "ghost small" }, m.dismissed ? "Restore" : "Not a reaction");
      const el = h("article", { class: `moment ${m.kind}${m.dismissed ? " dismissed" : ""}`, dataset: { id: m.id, kind: m.kind } },
        m.thumb ? h("img", { src: m.thumb, alt: `Game and face at ${timecode(m.t)}` }) : h("div", { class: "thumb-missing" }),
        h("div", { class: "body" },
          h("div", { class: "head" },
            h("span", { class: "mono time" }, timecode(m.t)),
            h("span", { class: "kind" }, KIND_LABEL[m.kind]),
            m === strongest ? h("span", { class: "badge" }, "Strongest") : null,
          ),
          m.kind === "mark"
            ? h("div", { class: "meta" }, "Marked during play")
            : h("div", {},
                h("div", { class: "strength", title: STRENGTH_TIP }, h("i", { style: `width:${Math.min(100, (m.strength / 10) * 100)}%` })),
                h("div", { class: "meta", title: STRENGTH_TIP }, strengthText(m.strength)),
              ),
        ),
        note,
        h("div", { class: "actions" }, h("span", { class: "replay-hint" }, icon("play"), "Replay from ", timecode(Math.max(0, m.t - LEAD_IN))), dismiss),
      );
      el.tabIndex = 0;
      el.ariaLabel = `${KIND_LABEL[m.kind]} at ${timecode(m.t)}. Press Enter to replay.`;
      el.onclick = (e) => {
        if (e.target === note || e.target === dismiss) return;
        select(m);
      };
      el.onkeydown = (e) => {
        if (e.key === "Enter" && e.target === el) select(m);
      };
      note.oninput = () => {
        m.note = note.value;
        onChange();
      };
      dismiss.onclick = () => {
        m.dismissed = !m.dismissed;
        el.classList.toggle("dismissed", m.dismissed);
        dismiss.textContent = m.dismissed ? "Restore" : "Not a reaction";
        onChange();
        redraw();
      };
      return el;
    };

    let saveTimer = 0;
    const onChange = () => {
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        saveTimer = 0;
        updateSession(session).catch(() => {});
      }, 300);
    };
    const fileBase = `flinch-${slug(session.tester)}-${slug(session.build)}-${new Date(session.createdAt).toLocaleDateString("en-CA")}`; // en-CA gives local YYYY-MM-DD
    const ext = session.mimeType.includes("mp4") ? "mp4" : "webm";
    const downloadRecording = () => {
      download(videos.game, `${fileBase}-game.${ext}`);
      setTimeout(() => download(videos.face, `${fileBase}-face.${ext}`), 400);
    };
    const progress = h("span", { class: "progress", id: "reel-progress", role: "status" });
    const reelBtn = h("button", { class: "primary", id: "make-reel" }, icon("film"), "Highlight reel");
    reelBtn.onclick = async () => {
      if (!keptMoments(session).length) {
        progress.textContent = "No moments to put in a reel. Mark one, or restore a dismissed one.";
        return;
      }
      reelBtn.disabled = true;
      player.game.pause();
      try {
        const reel = await makeReel(session, videos, (done, total) => {
          progress.textContent = done < total ? `Recording the reel: moment ${done + 1} of ${total}. Keep this tab open.` : "Finishing…";
        });
        const isMp4 = reel.type.includes("mp4");
        download(reel, `${fileBase}-reel.${isMp4 ? "mp4" : "webm"}`);
        progress.textContent = isMp4 ? "Reel saved as MP4." : "Reel saved as WebM (this browser can't record MP4). It plays in Chrome and VLC.";
      } catch (e) {
        progress.textContent = `The reel failed: ${(e as Error).message}`;
      } finally {
        reelBtn.disabled = false;
      }
    };
    const exports = h("div", { class: "exports" },
      h("button", { class: "secondary", id: "download-notes", title: "A Markdown fix list of the kept moments",
        onclick: () => download(new Blob([notesMarkdown(session)], { type: "text/markdown" }), `${fileBase}-notes.md`) }, icon("notes"), "Notes (.md)"),
      h("button", { class: "secondary", id: "download-recording", title: `Two ${ext.toUpperCase()} files: game and face` }, icon("download"), "Recording"),
      reelBtn,
    );
    exports.querySelector<HTMLButtonElement>("#download-recording")!.onclick = downloadRecording;

    const unsavedBanner = opts.unsaved
      ? h("div", { class: "notice error banner", id: "unsaved", role: "alert" },
          h("span", {}, icon("alert"), " This browser couldn't save the playtest (storage full, or a private window). Download it now so it isn't lost."),
          h("button", { class: "danger", onclick: downloadRecording }, icon("download"), "Download recording"))
      : null;
    const freshBanner = opts.fresh && strongest
      ? h("div", { class: "notice banner fresh", id: "fresh" },
          h("span", {}, h("b", {}, `${session.moments.filter((m) => m.kind !== "mark").length} possible reaction${session.moments.filter((m) => m.kind !== "mark").length === 1 ? "" : "s"} found.`),
            ` Strongest at ${timecode(strongest.t)} (${KIND_LABEL[strongest.kind].toLowerCase()}).`),
          h("button", { class: "primary", id: "replay-strongest", onclick: () => select(strongest) }, icon("play"), "Replay it"))
      : null;

    const renderList = () => {
      const auto = session.moments.filter((m) => m.kind !== "mark");
      list.replaceChildren(
        h("h3", {}, `Moments · ${session.moments.length}`),
        ...(auto.length ? [] : [h("p", { class: "empty", id: "no-moments" },
          session.duration < 5
            ? "This session was too short to find reactions. Record at least a minute of play."
            : "No clear reactions this time: the tester's face stayed close to resting. The timeline still shows every change, and your own marks appear here.")]),
        ...session.moments.map(row),
      );
    };
    renderList();

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === " " && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        player.toggle();
      } else if (e.key === "n") step(1);
      else if (e.key === "p") step(-1);
      else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        player.seek(player.time + (e.key === "ArrowRight" ? 5 : -5));
      }
    };
    addEventListener("keydown", onKey);
    addEventListener("resize", redraw);

    const faceShare = session.samples.length ? session.samples.filter((x) => x.face).length / session.samples.length : 1;
    root.append(
      h("main", { class: "review", id: "review", dataset: { samples: String(session.samples.length), faces: String(session.samples.filter((x) => x.face).length) } },
        h("header", { class: "bar" },
          h("button", { class: "ghost", onclick: () => show(homeScreen()) }, icon("back"), "Playtests"),
          h("div", { class: "title-block" },
            h("h2", {}, `${session.tester} · ${session.build}`),
            h("span", { class: "who" }, `${new Date(session.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · ${timecode(session.duration)}`),
          ),
          h("span", { class: "spacer" }),
          progress,
          exports,
        ),
        unsavedBanner,
        freshBanner,
        faceShare < 0.6 && session.samples.length > 30
          ? h("div", { class: "notice warn banner", id: "low-face" }, h("span", {}, icon("alert"), ` The tester's face was out of view for ${Math.round((1 - faceShare) * 100)}% of the session (shaded on the timeline). Reactions there can't be found.`))
          : null,
        h("div", { class: "review-body" },
          h("section", { class: "viewer" },
            player.el,
            h("div", { class: "transport" }, prevBtn, playBtn, nextBtn, clock, h("span", { class: "spacer" }),
              h("span", { class: "legend" },
                h("span", {}, h("i", { style: "background:var(--frus)" }), SIGNAL_LABEL.f),
                h("span", {}, h("i", { style: "background:var(--joy)" }), SIGNAL_LABEL.d),
                h("span", {}, h("i", { style: "background:var(--mark)" }), "Your marks"),
              ),
            ),
            h("div", { class: "timeline-wrap" }, timeline, tip),
            h("p", { class: "hint" },
              "Click a pin or a moment to replay from 3 seconds before. ",
              h("kbd", {}, "Space"), " play/pause · ", h("kbd", {}, "←"), h("kbd", {}, "→"), " 5 s · ", h("kbd", {}, "N"), h("kbd", {}, "P"), " next/previous moment. ",
              h("span", { class: "dim" }, MEASURE_NOTE),
            ),
          ),
          list,
        ),
      ),
    );
    redraw();
    void player.load(videos.game, videos.face).then(() => {
      root.querySelector("#review")?.setAttribute("data-ready", "1");
      // Open on the strongest reaction, paused just before it, so the first thing on screen is the moment that matters.
      if (strongest) select(strongest, false);
      else redraw();
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
