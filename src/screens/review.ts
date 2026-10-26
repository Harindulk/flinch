import { download, h } from "../dom";
import { slug, timecode } from "../format";
import { icon } from "../icons";
import { KIND_LABEL, MEASURE_NOTE, SIGNAL_LABEL, STRENGTH_TIP, strengthText, whyPinned } from "../labels";
import { MIN_SECONDS, THRESHOLD } from "../moments";
import { show, type Screen } from "../nav";
import { Player } from "../player";
import { drawTimeline, timeAt } from "../timeline";
import type { Moment, Session, Videos } from "../types";
import { keptMoments, makeReel, notesMarkdown } from "../export";
import { listSessions, updateSession } from "../store";
import { compareText, stats } from "../compare";
import { homeScreen } from "./home";
import "../review.css";

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

    let ghost: Session | null = null;
    // The timeline spans the longer of the two playtests while comparing, so neither is cut off.
    const span = () => Math.max(session.duration, ghost?.duration ?? 0);
    const redraw = () => {
      clock.textContent = `${timecode(player.time)} / ${timecode(session.duration)}`;
      drawTimeline(timeline, session.samples, { from: 0, to: span(), moments: session.moments, playhead: player.time, selected, threshold: THRESHOLD, thresholdLabel: "pin line", hover: hoverT ?? undefined, ghost: ghost?.samples });
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
      if (play && player.ready && !player.gameFailed) player.game.play().catch(() => {});
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
      const t = timeAt(timeline, clientX, 0, span());
      const px = timeline.clientWidth / Math.max(span(), 1);
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
      tip.textContent = pin
        ? `${timecode(pin.t)} · ${KIND_LABEL[pin.kind]}${pin.kind === "mark" ? "" : ` · ${pin.strength.toFixed(1)}×`}${pin.dismissed ? " (dismissed)" : ""} · click to replay`
        : `${timecode(t)} · click to jump here`;
      const r = timeline.getBoundingClientRect();
      const half = Math.min(tip.offsetWidth / 2 + 4, r.width / 2);
      tip.style.left = `${Math.min(Math.max(e.clientX - r.left, half), r.width - half)}px`;
      redraw();
    };
    timeline.onmouseleave = () => {
      hoverT = null;
      tip.hidden = true;
      redraw();
    };

    const row = (m: Moment) => {
      const note = h("textarea", { placeholder: "What happened here? e.g. jump too far", value: m.note, rows: 1, ariaLabel: `Note for ${timecode(m.t)}` });
      const dismissTitle = "Wrong pin? Dismiss it: it stays in this list, faded, but leaves the fix list and the reel.";
      const dismiss = h("button", { class: "ghost small", title: dismissTitle, ariaLabel: `Dismiss the pin at ${timecode(m.t)}` }, "Dismiss");
      const setDismissLabel = () => {
        dismiss.textContent = m.dismissed ? "Restore" : "Dismiss";
        dismiss.title = m.dismissed ? "Put this pin back in the fix list and the reel." : dismissTitle;
        dismiss.ariaLabel = `${m.dismissed ? "Restore" : "Dismiss"} the pin at ${timecode(m.t)}`;
      };
      setDismissLabel();
      const el = h("article", { class: `moment ${m.kind}${m.dismissed ? " dismissed" : ""}`, dataset: { id: m.id, kind: m.kind } },
        m.thumb ? h("img", { src: m.thumb, alt: `Game and face at ${timecode(m.t)}` }) : h("div", { class: "thumb-missing", title: "No frame could be read from the recording here" }, "No frame"),
        h("div", { class: "body" },
          h("div", { class: "head" },
            h("span", { class: "mono time" }, timecode(m.t)),
            h("span", { class: "kind" }, KIND_LABEL[m.kind]),
            m === strongest ? h("span", { class: "badge" }, "Strongest") : null,
            h("span", { class: "dismissed-tag" }, "Dismissed"),
          ),
          m.kind === "mark"
            ? h("div", { class: "meta" }, whyPinned(m.kind, THRESHOLD, MIN_SECONDS))
            : h("div", {},
                h("div", { class: "strength", title: STRENGTH_TIP }, h("i", { style: `width:${Math.min(100, (m.strength / 10) * 100)}%` })),
                h("div", { class: "meta", title: STRENGTH_TIP }, strengthText(m.strength)),
                h("div", { class: "why" }, whyPinned(m.kind, THRESHOLD, MIN_SECONDS)),
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
      note.onblur = () => saveTimer && save();
      dismiss.onclick = () => {
        m.dismissed = !m.dismissed;
        el.classList.toggle("dismissed", m.dismissed);
        setDismissLabel();
        onChange();
        redraw();
      };
      return el;
    };

    // Notes and dismissals save to this browser a moment after each change; the status line says whether that worked.
    const saveState = h("p", { class: "save-state", id: "save-state", role: "status" },
      opts.unsaved ? "This playtest isn't stored in this browser, so notes won't be kept. Download Notes (.md) before you leave." : "Notes save on this device as you type.");
    if (opts.unsaved) saveState.classList.add("error");
    let saveTimer = 0;
    const save = () => {
      clearTimeout(saveTimer);
      saveTimer = 0;
      if (opts.unsaved) return; // a session record without its videos would show up as a broken playtest
      updateSession(session).then(
        () => {
          saveState.classList.remove("error");
          saveState.textContent = `Saved ${new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}.`;
        },
        () => {
          saveState.classList.add("error");
          saveState.textContent = "Couldn't save your notes in this browser. Download Notes (.md) so they aren't lost.";
        },
      );
    };
    const onChange = () => {
      clearTimeout(saveTimer);
      if (!opts.unsaved) saveState.textContent = "Saving…";
      saveTimer = window.setTimeout(save, 300);
    };
    const onPageHide = () => saveTimer && save();
    addEventListener("pagehide", onPageHide);
    const fileBase = `flinch-${slug(session.tester)}-${slug(session.build)}-${new Date(session.createdAt).toLocaleDateString("en-CA")}`; // en-CA gives local YYYY-MM-DD
    const ext = session.mimeType.includes("mp4") ? "mp4" : "webm";
    const downloadNotes = () => download(new Blob([notesMarkdown(session)], { type: "text/markdown" }), `${fileBase}-notes.md`);
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
        onclick: downloadNotes }, icon("notes"), "Notes (.md)"),
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
      const marks = session.moments.length - auto.length;
      const guide = h("details", { class: "guide", open: !!opts.fresh && session.moments.length > 0 },
        h("summary", {}, "How to read and use these pins"),
        h("ul", {},
          h("li", {}, h("b", { class: "c-frus" }, "Red"), ": possible frustration. Tension in the brows and lips rose well above this tester's resting face."),
          h("li", {}, h("b", { class: "c-joy" }, "Green"), ": possible delight. A smile rose well above their resting face."),
          h("li", {}, h("b", { class: "c-mark" }, "Amber"), ": your mark, from pressing M during play."),
          h("li", {}, "Slight, Clear or Strong, and the ×: how far the expression moved, in multiples of the tester's normal variation at rest. A pin needs ", `${THRESHOLD}× for ${MIN_SECONDS} s`, " (the dashed pin line). A laugh or groan heard at the same moment raises it by 1.5×."),
          h("li", {}, "Click a pin or a card to replay from 3 s before. ", h("kbd", {}, "N"), " ", h("kbd", {}, "P"), " jump between pins, ", h("kbd", {}, "←"), " ", h("kbd", {}, "→"), " move 5 s."),
          h("li", {}, "Write what happened in the note. If a pin isn't a real reaction (a sneeze, talking), press Dismiss."),
        ),
        h("p", { class: "dim" }, "A pin says where to look, not what the tester felt."),
      );
      const empty = session.duration < 5
        ? "This session was too short to find reactions. Record at least a minute of play."
        : `No pins from the face this time: the tester's expression stayed close to resting and never crossed the pin line. That can just mean a smooth run.${marks ? " Your own marks are below." : ""}`;
      list.replaceChildren(
        h("div", { class: "moments-head" }, h("h2", { class: "label" }, `Moments · ${session.moments.length}`), saveState),
        guide,
        ...(auto.length ? [] : [h("div", { class: "empty", id: "no-moments" },
          h("p", {}, empty),
          h("p", {}, "Next time: press ", h("kbd", {}, "M"), " during play to pin a moment yourself, and check the face is evenly lit from the front and stays in view."))]),
        ...session.moments.map(row),
        h("div", { class: "next-step" },
          h("p", {}, h("b", {}, "Done reviewing? "), session.moments.length
            ? "Download the fix list: every kept pin with its time and your note, as Markdown for your tracker."
            : "The fix list still records that nothing was pinned."),
          h("button", { class: "secondary", onclick: downloadNotes }, icon("notes"), "Download fix list (.md)"),
        ),
      );
    };
    renderList();

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return; // leave Cmd+P and friends to the browser
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === " " && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLElement && e.target.tagName === "SUMMARY")) {
        e.preventDefault();
        player.toggle();
      } else if (key === "n") step(1);
      else if (key === "p") step(-1);
      else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        player.seek(player.time + (e.key === "ArrowRight" ? 5 : -5));
      }
    };
    addEventListener("keydown", onKey);
    addEventListener("resize", redraw);

    // Compare builds: another saved playtest drawn dashed behind this one, with a plain summary.
    const picker = h("select", { id: "compare", ariaLabel: "Compare with another playtest" }, h("option", { value: "" }, "Compare with another playtest…"));
    const summary = h("div", { class: "cmp-summary", id: "compare-summary", ariaLive: "polite" });
    const compareBar = h("div", { class: "cmp-bar", hidden: true }, h("span", { class: "cmp-key" }, "Dashed line: the playtest you compare with"), picker, summary);
    const label = (s: Session) => `${s.build} · ${s.tester} · ${new Date(s.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
    let others: Session[] = [];
    listSessions().then((all) => {
      others = all.filter((s) => s.id !== session.id);
      if (!others.length) return;
      picker.append(...others.map((s) => h("option", { value: s.id }, label(s))));
      compareBar.hidden = false;
    }, () => {});
    picker.onchange = () => {
      ghost = others.find((s) => s.id === picker.value) ?? null;
      summary.replaceChildren();
      if (ghost) {
        const t = compareText(stats(session), stats(ghost), ghost.build === session.build ? `the ${label(ghost)} run` : ghost.build);
        summary.append(
          h("p", {}, h("b", {}, "This playtest: "), t.now),
          h("p", {}, h("b", {}, `${label(ghost)}: `), t.before),
          h("p", { class: "cmp-verdict" }, t.verdict),
        );
      }
      redraw();
    };

    const faceShare = session.samples.length ? session.samples.filter((x) => x.face).length / session.samples.length : 1;
    root.append(
      h("main", { class: "review", id: "review", dataset: { samples: String(session.samples.length), faces: String(session.samples.filter((x) => x.face).length), maxGap: String(maxGap(session)) } },
        h("header", { class: "bar" },
          h("button", { class: "ghost", onclick: () => show(homeScreen()) }, icon("back"), "Playtests"),
          h("div", { class: "title-block" },
            h("h1", {}, `${session.tester} · ${session.build}`),
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
            compareBar,
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
      if (player.gameFailed) playBtn.disabled = prevBtn.disabled = nextBtn.disabled = true;
      // Open on the strongest reaction, paused just before it, so the first thing on screen is the moment that matters.
      if (strongest) select(strongest, false);
      else redraw();
    });

    return () => {
      if (saveTimer) save();
      removeEventListener("pagehide", onPageHide);
      cancelAnimationFrame(raf);
      removeEventListener("keydown", onKey);
      removeEventListener("resize", redraw);
      player.destroy();
    };
  };
}

/** Longest stretch without a face read, for the end-to-end checks (data-max-gap). */
function maxGap(s: Session): number {
  let gap = 0;
  for (let i = 1; i < s.samples.length; i++) gap = Math.max(gap, s.samples[i].t - s.samples[i - 1].t);
  return Math.round(gap * 100) / 100;
}
