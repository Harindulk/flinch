---
doc: prd
status: draft
---

> **How this draft was made.** Drafted overnight by the agent on 24 Oct 2026, at Harindu's request, while Harindu was away. Product choices here are the agent's, labelled **[agent]** under Product Decisions, until Harindu reviews them. See **Open Questions**.

# Flinch — Product Requirements

Flinch is a one-tab playtest recorder for solo game devs: it records the game and the player's face, and bookmarks the moments the player got frustrated or delighted.
Source: `scope.md > The Unique Kernel`, `scope.md > Who It's For`.

## The Core Journey
1. The dev opens Flinch in Chrome. The home screen lists past playtests (empty the first time) and a big **New playtest** button.
2. **Setup.** The dev types the tester's first name and the build being tested (e.g. "Drive Away 0.9"). The tester ticks a consent box: "I agree to be recorded. The recording stays on this computer."
3. The dev clicks **Choose game window** (Chrome's own picker) and **Turn on camera & mic**. Both previews appear: game big, face small.
4. The dev clicks **Calibrate**. A ten-second countdown asks the tester to relax and look at the screen. Flinch learns that person's resting face.
5. **Recording** starts by itself after calibration. The game fills the screen with the face in a corner; along the bottom runs a live reaction line (red up for frustration, green up for delight). A timer counts up. Pressing **M** or the Mark button drops a manual pin.
6. The dev clicks **Stop** (or stops sharing the window). Flinch saves the session and opens **Review**.
7. **Review.** The recording plays at the top; the full reaction timeline sits under it with pins on the biggest spikes. A list of moments sits on the right: type, timecode, a thumbnail, how strong it was.
8. Clicking a pin or a list row jumps the video to just before the moment and plays it. The dev types a note on the moment or dismisses it if it was wrong (a sneeze, a phone notification).
9. **Export.** **Download notes** saves a Markdown file of the kept moments with timecodes and notes. **Make highlight reel** plays each kept moment into a short video with a label card, then downloads it. **Download recording** saves the whole session (game and face files).
10. Success: the dev knows which three moments to fix, without rewatching the whole session.

## Screens and Layout
- **Home**: header with the Flinch name and the line "Your playtester won't tell you. Their face will."; a list of saved sessions (tester, build, date, length, moment count; open or delete); the New playtest button; a short line on privacy ("Nothing leaves this computer").
- **Setup**: two preview tiles side by side (game, camera), the name/build fields, the consent box, and the Calibrate button, which stays disabled until both sources are on and consent is ticked.
- **Calibrate**: an overlay on the setup screen with the countdown ring and a face-found indicator.
- **Recording**: full-width live composite (game plus face corner), a reaction strip at the bottom, the timer, Mark, Stop.
- **Review**: video on the left two-thirds with the timeline under it; moments list on the right; export buttons in the header.

## Look and Feel
[agent] Dark editing-suite look (think a video editor or DAW). Charcoal background, off-white text, one accent per signal: coral red for frustration, lime green for delight, amber for manual marks. Monospace timecodes. Big, calm controls that read on a screen recording. No gradients-on-everything "AI app" styling. Source: `scope.md > Inspiration & Identity`.

## Features and Behavior

### Capture
- As a solo dev, I want to record the game and my tester's face together so that I can see what they saw and how they reacted.
  - [ ] Choosing a window shows its live preview; turning on the camera shows the face preview.
  - [ ] Review plays the game with the tester's face in a corner, in sync, with the microphone sound and the game's sound if the browser provides it.
  - [ ] Recording keeps going while the game window covers Flinch.
  - [ ] If the tester stops sharing the window from Chrome's bar, the recording stops and is saved, not lost.

### Calibration
- As a dev, I want Flinch to learn each tester's resting face so that a person who frowns while concentrating doesn't fill the timeline with false pins.
  - [ ] A ten-second countdown runs; the screen says whether a face is visible.
  - [ ] If no face was seen for most of the ten seconds, Flinch says so and offers to retry instead of starting.

### Live reaction line
- As a dev watching over a shoulder, I want a live line of how the tester feels so that I can see reactions as they happen.
  - [ ] While recording, the strip shows the last 30 seconds: frustration and delight as two lines that move within a second of a face change.
  - [ ] If the face leaves the camera, the line shows a gap and a "face lost" label instead of dropping to zero.

### Automatic bookmarks
Pins are labelled "Possible frustration" and "Possible delight": Flinch measures facial-expression changes against the tester's resting face, not feelings, and says so on Review and in the notes file.
- As a dev, I want the strongest reactions pinned for me so that I don't have to scrub the whole video.
  - [ ] After Stop, pins appear where a signal rose clearly above that tester's calibrated resting level for at least about half a second.
  - [ ] Pins closer than five seconds together merge into one; at most the 12 strongest are kept.
  - [ ] A loud sound from the tester (a groan, a laugh, "no!") at the same moment makes that pin stronger.
  - [ ] Manual marks (M key / button) always appear as amber pins.

### Review and notes
- As a dev, I want to jump to each moment and write what went wrong so that I end with a fix list.
  - [ ] Clicking a pin or row seeks to three seconds before the moment and plays.
  - [ ] A fresh session opens on its strongest moment, paused just before it, with a "Replay it" button; previous/next-moment buttons and N/P step through pins.
  - [ ] Each moment shows type, timecode, strength, and a thumbnail taken from the recording.
  - [ ] Notes and dismissals are saved immediately and survive a page refresh.

### Export
- As a dev, I want to take the moments with me so that I can fix them and show them.
  - [ ] Download notes gives a Markdown file: session title, tester, build, date, then each kept moment with timecode, type, strength and note.
  - [ ] Make highlight reel produces a WebM of each kept moment (about 3 s before to 3 s after) with a label card ("0:42 · Frustration"), in timeline order.
  - [ ] Download recording gives the whole session as two WebM files (game, face).

### Saved sessions
- As a dev, I want past playtests to stay on my laptop so that a refresh or a crash doesn't lose a test.
  - [ ] Sessions appear on Home after a refresh, newest first, and open into Review.
  - [ ] Deleting a session asks for confirmation and removes it.

## States and Boundaries
- **First use**: Home shows no sessions and explains the three steps (pick window, camera on, calibrate).
- **Camera or screen permission denied**: the tile says what was blocked and how to allow it in Chrome; nothing crashes.
- **No camera on the machine**: the tile says Flinch needs a webcam.
- **Face lost while recording**: gap in the line plus a "Face lost" chip; recording continues. Review warns if the face was out of view for most of the session.
- **Two faces in view**: Flinch follows the face nearest the camera and says so during calibration and recording.
- **Face model fails to load**: a message with Try again; nothing is recorded until it works.
- **Refresh or close mid-session**: Chrome asks before leaving, so a recording isn't lost by accident.
- **Very short session**: Review says it was too short to find reactions.
- **No moments found**: Review says "No big reactions this time" and still shows the timeline and manual marks.
- **Storage full or unavailable**: Flinch offers to download the recording right away so it isn't lost.
- **Unsupported browser**: Home says Flinch needs desktop Chrome or Edge.
- **Privacy boundary**: no network calls with recordings or face data. The face model is loaded from the app itself.

## Product Decisions
- [agent] One tester and one local session at a time, because the user is a solo dev with a friend next to them (`scope.md > Who It's For`).
- [agent] Two signals only (frustration, delight), because fewer, clearer pins demo better than many uncertain labels (`scope.md > Explicitly Cut`).
- [agent] Per-player calibration before every session, because resting faces differ (a concentrating frown is not frustration).
- [agent] Consent tick box on Setup, because a friend's face is being recorded.
- [agent] Highlight reel as the headline export, because indie devs share reaction clips and it makes the fix list watchable.

## What We're Building
Everything under **Features and Behavior** and **States and Boundaries**.

## Deferred From the POC
- Comparing sessions across builds: needs a second view and matching moments; valuable but not needed to prove the kernel.
- Game-sent event markers: needs a small SDK per engine.
- Multiple testers' heat map: needs several sessions recorded first.

## Possible Later Enhancements
- A tiny Unity/web snippet that posts "player died" events to Flinch's timeline.
- Per-build trend line: average frustration per level.

## Non-Goals
- Cloud upload, accounts, links: the privacy promise is the product.
- Naming feelings beyond frustration/delight.
- Measuring "fun" as a score; Flinch points at moments, it doesn't grade a game.
- Mobile browsers.

## Open Questions
- (Can wait) Harindu: are the colors and the name right?
- (Can wait) Harindu: should the reel include the tester's voice by default, or be muted?
- (Before shipping) Harindu needs a friend who agrees to appear in the demo video.
