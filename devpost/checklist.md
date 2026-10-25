---
doc: checklist
status: draft
---

> Drafted overnight by the agent on 24 Oct 2026, at Harindu's request, while Harindu was away. Built in fast mode without the learner checks; the hands-on checkpoints below wait for Harindu.

# Build Checklist

Build mode: fast (Harindu asked for autonomous overnight work)

## Slices

- [x] **1. You can record a playtest and watch it back**
  Becomes usable: Open Flinch, pick a window, turn on the camera, start, stop, and watch one video with the game and the face in a corner.
  Why now: Proves the whole capture path (the part most likely to break) end to end, with the project scaffold included.
  PRD ref: `prd.md > The Core Journey` (steps 1–3, 5–7), `prd.md > Features and Behavior > Capture`
  Spec ref: `spec.md > Capture`, `spec.md > Recorder`, `spec.md > App shell and router`, `spec.md > File Structure`
  Build: Scaffold index.html, styles, router; Setup screen with consent, window and camera tiles; the two MediaRecorders; Record screen with timer and Stop; a basic Review that plays the game recording with the face recording in sync in a corner.
  Verify (mechanical): `npm run build` passes; `npm run e2e` with a fake camera and screen records for a few seconds and the Review video has a duration above 0.
  Learner check: Record yourself for 20 seconds with any window and play it back. Is the face corner the right size and place?
  Commit: `Record the game window and webcam and play them back together`

- [x] **2. Flinch learns your resting face and shows a live reaction line**
  Becomes usable: A ten-second calibration, then a live frustration/delight line under the recording that moves with your face.
  Why now: This is the kernel; everything after it depends on the scores being right.
  PRD ref: `prd.md > Features and Behavior > Calibration`, `prd.md > Features and Behavior > Live reaction line`
  Spec ref: `spec.md > Face reader`, `spec.md > Signal maker`, `spec.md > Loudness meter`, `spec.md > Live strip and review timeline`
  Build: face.ts + face.worker.ts, signals.ts (raw signals, calibrate, score) with unit tests, calibration overlay with face-found indicator and retry, loudness meter, live strip on the Record screen with face-lost gaps.
  Verify (mechanical): `npm test` passes the signals tests; `npm run e2e` shows the calibration finding a face in the fake camera and samples being collected.
  Learner check: Calibrate, then smile and frown at the camera. Do the green and red lines move the way you expect?
  Commit: `Calibrate to the tester and draw a live reaction line`

- [x] **3. Stop shows pins on the biggest reactions, and clicking one replays it**
  Becomes usable: After Stop, a timeline under the video with pins and a moments list with thumbnails; clicking jumps to three seconds before.
  Why now: Completes the kernel: the dev no longer has to scrub the whole video.
  PRD ref: `prd.md > Features and Behavior > Automatic bookmarks`, `prd.md > Features and Behavior > Review and notes`
  Spec ref: `spec.md > Moment finder`, `spec.md > Live strip and review timeline`
  Build: moments.ts with unit tests, manual marks (M key and button), thumbs.ts moment thumbnails, Review timeline with pins, playhead and click-to-seek, moments list with note field and dismiss.
  Verify (mechanical): `npm test` passes the moments tests; `npm run e2e` presses M during recording and finds an amber pin on Review.
  Learner check: Record 30 seconds, smile hard once and frown once, press M once. Do three pins land in the right places?
  Commit: `Find reaction moments and pin them on the review timeline`

- [x] **4. Playtests are kept on the laptop**
  Becomes usable: Sessions, notes and dismissals survive a refresh; Home lists them; delete works.
  Why now: A lost playtest is the worst failure; this has to land before export builds on it.
  PRD ref: `prd.md > Features and Behavior > Saved sessions`, `prd.md > States and Boundaries`
  Spec ref: `spec.md > Session store`, `spec.md > Data Model`
  Build: store.ts over IndexedDB, Home list with open/delete, `#/review/<id>` reload, notes saved on input, save-failure banner with download.
  Verify (mechanical): `npm run e2e` records a session, reloads the page, finds it on Home, opens it, and sees the note typed before the reload.
  Learner check: Record, write a note, refresh the tab. Is everything still there?
  Commit: `Save playtests and notes in the browser`

- [x] **5. You can take the moments with you**
  Becomes usable: Download notes (Markdown), download the recording (game and face files), and make a highlight reel of the kept moments.
  Why now: The export is what the dev fixes from and what makes the demo memorable.
  PRD ref: `prd.md > Features and Behavior > Export`
  Spec ref: `spec.md > Export`
  Build: notesMarkdown with unit test, downloads, makeReel with title cards and progress, muted to the speakers.
  Verify (mechanical): `npm test` passes the notes test; `npm run e2e` makes a reel and checks the downloaded file is a WebM with a duration.
  Learner check: Make a reel from a session with three moments and watch it. Do the title cards read well?
  Commit: `Export notes, recordings and a highlight reel`

- [x] **6. Every awkward case says something helpful**
  Becomes usable: Clear messages for denied permissions, no camera, unsupported browser, no moments, face lost; first-use Home explains the steps.
  Why now: Polish after the kernel works; these are the states a judge or a friend hits first.
  PRD ref: `prd.md > States and Boundaries`, `prd.md > Look and Feel`
  Spec ref: `spec.md > Important Failure Modes`, `spec.md > Look and Feel`
  Build: Error copy and states in capture, setup and review; empty states; visual pass against Look and Feel.
  Verify (mechanical): `npm run e2e` runs a denied-camera case and a blank-camera (no face) case and finds the messages; screenshots of each screen checked by eye.
  Learner check: Open Flinch in a browser where the camera is blocked. Does the message tell you what to do?
  Commit: `Handle permission, face and empty states`

## Hands-on Checkpoints

- [ ] Early usable behavior explored — after slice 3 (Harindu, morning of 24 Oct)
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: not started — waits for Harindu. `devpost/app-map.html` was generated from commit 939f038 and checked in a headless render; not shown to Harindu yet.
Route and stops: reference route only (not toured): `src/face.worker.ts` → `src/signals.ts > Scorer` → `src/screens/record.ts > onFace` → `src/moments.ts > findMoments` → `src/screens/review.ts > select`
Edit outcome: not started
Reflection: not started
Activity mode: not started

## Revisions
- Screen and camera are recorded as two native WebM files and composited at playback and in the reel, instead of painting one canvas from the page — a game window covering the Flinch tab makes Chrome throttle page drawing, which would freeze a page-drawn recording. The face model runs in a worker fed by MediaStreamTrackProcessor for the same reason (probe 24 Oct: 16 fps in a module worker).
- Slices 2 and 3 landed in one commit — the record screen's calibration, live line and Mark key were written in one pass, so splitting them would have meant committing a half-wired screen.
- A big grin now damps the frustration score (`src/signals.ts > rawSignals`) — the reaction test showed a smile also lifting frustration through eye squint and nose wrinkle.
- The e2e "reaction" camera fixture is spliced from two MediaPipe public test images (a calm face, then a smiling one), downloaded at test time into `e2e/out/` and never committed.
- The highlight reel records as MP4 (H.264/AAC) when Chrome supports it, WebM otherwise — MediaRecorder WebM files carry no duration, which trips up QuickTime and some upload sites. The e2e run got a 12.4 s MP4 with a real duration.
- The hidden-tab check moved from `npm run e2e` to Harindu's hands-on check: headless Chromium never marks a tab hidden, so the test couldn't prove anything there. The design (native recorders plus a face worker) doesn't depend on the page's timers; it still needs one real run with the game window covering Flinch.
- Blocked-camera e2e fakes the browser's "NotAllowedError", because headless Chromium can't show a real Block choice. It surfaced a real gap: Chrome refuses camera and screen on non-secure addresses (a LAN IP over http), which Flinch now explains on Home and Setup.
- The resting level now drifts slowly during play (`src/signals.ts > Scorer`) — calibration happens on a relaxed face, but players frown in concentration for minutes, which would have filled the timeline with false frustration pins.
- Polish and reliability pass (26 Oct, on Harindu's "premium, production-quality" goal): calibrated wording ("possible", "expression change") instead of naming feelings; two-face handling; model-load retry; recorder-error stop; refresh warning; short-session and low-face messages; review opens on the strongest moment; live pins while recording; numbered setup steps; local-date file names. New e2e cases cover each failure path and stream cleanup (11 tests, also against the production build).
- Gap filling after Stop (`src/backfill.ts`) — a frozen-page test showed live face reads stop whenever the page's own thread stalls, because Chrome (v156) can't hand camera tracks to a worker. Missing stretches are now read back from the face recording. Automated Chromium never reports a tab as hidden (tried the headless shell, full Chromium headless and headed, minimizing, and re-enabling background throttling), so a true background tab remains a hands-on check.
- Lint added (`npm run lint`: strict TypeScript); a one-off typed ESLint pass found 13 issues, all fixed, including a Stop wrap-up that could hang on "Saving…" if anything threw.
- Long-session check: a 10-minute soak (`SOAK_MIN=10 npm run e2e -- soak`) kept the JS heap flat at 10 MB and browser memory flat (~1.0–1.25 GB, no growth); Stop → Review 3.9 s; 7 MB/min of recording with the fake screen.
