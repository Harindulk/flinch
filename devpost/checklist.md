---
doc: checklist
status: draft
---

> Drafted overnight by the agent on 24 Oct 2026, at Harindu's request, while Harindu was away. Built in fast mode without the learner checks; the hands-on checkpoints below wait for Harindu.

# Build Checklist

Build mode: fast (Harindu asked for autonomous overnight work)

## Slices

- [ ] **1. You can record a playtest and watch it back**
  Becomes usable: Open Flinch, pick a window, turn on the camera, start, stop, and watch one video with the game and the face in a corner.
  Why now: Proves the whole capture path (the part most likely to break) end to end, with the project scaffold included.
  PRD ref: `prd.md > The Core Journey` (steps 1–3, 5–7), `prd.md > Features and Behavior > Capture`
  Spec ref: `spec.md > Capture`, `spec.md > Compositor and recorder`, `spec.md > App shell and router`, `spec.md > File Structure`
  Build: Scaffold index.html, styles, router; Setup screen with consent, window and camera tiles; compositor canvas + audio mix + MediaRecorder; Record screen with timer and Stop; a basic Review that plays the recorded Blob.
  Verify (mechanical): `npm run build` passes; `npm run e2e` with a fake camera and screen records for a few seconds and the Review video has a duration above 0.
  Learner check: Record yourself for 20 seconds with any window and play it back. Is the face corner the right size and place?
  Commit: `Record game window and webcam into one video`

- [ ] **2. Flinch learns your resting face and shows a live reaction line**
  Becomes usable: A ten-second calibration, then a live frustration/delight line under the recording that moves with your face.
  Why now: This is the kernel; everything after it depends on the scores being right.
  PRD ref: `prd.md > Features and Behavior > Calibration`, `prd.md > Features and Behavior > Live reaction line`
  Spec ref: `spec.md > Face reader`, `spec.md > Signal maker`, `spec.md > Loudness meter`, `spec.md > Live strip and review timeline`
  Build: face.ts wrapper, signals.ts (raw signals, calibrate, score) with unit tests, calibration overlay with face-found indicator and retry, loudness meter, live strip on the Record screen with face-lost gaps.
  Verify (mechanical): `npm test` passes the signals tests; `npm run e2e` shows the calibration finding a face in the fake camera and samples being collected.
  Learner check: Calibrate, then smile and frown at the camera. Do the green and red lines move the way you expect?
  Commit: `Calibrate to the tester and draw a live reaction line`

- [ ] **3. Stop shows pins on the biggest reactions, and clicking one replays it**
  Becomes usable: After Stop, a timeline under the video with pins and a moments list with thumbnails; clicking jumps to three seconds before.
  Why now: Completes the kernel: the dev no longer has to scrub the whole video.
  PRD ref: `prd.md > Features and Behavior > Automatic bookmarks`, `prd.md > Features and Behavior > Review and notes`
  Spec ref: `spec.md > Moment finder`, `spec.md > Live strip and review timeline`
  Build: moments.ts with unit tests, manual marks (M key and button), thumbnails each second, Review timeline with pins, playhead and click-to-seek, moments list with note field and dismiss.
  Verify (mechanical): `npm test` passes the moments tests; `npm run e2e` presses M during recording and finds an amber pin on Review.
  Learner check: Record 30 seconds, smile hard once and frown once, press M once. Do three pins land in the right places?
  Commit: `Find reaction moments and pin them on the review timeline`

- [ ] **4. Playtests are kept on the laptop**
  Becomes usable: Sessions, notes and dismissals survive a refresh; Home lists them; delete works.
  Why now: A lost playtest is the worst failure; this has to land before export builds on it.
  PRD ref: `prd.md > Features and Behavior > Saved sessions`, `prd.md > States and Boundaries`
  Spec ref: `spec.md > Session store`, `spec.md > Data Model`
  Build: store.ts over IndexedDB, Home list with open/delete, `#/review/<id>` reload, notes saved on input, save-failure banner with download.
  Verify (mechanical): `npm run e2e` records a session, reloads the page, finds it on Home, opens it, and sees the note typed before the reload.
  Learner check: Record, write a note, refresh the tab. Is everything still there?
  Commit: `Save playtests and notes in the browser`

- [ ] **5. You can take the moments with you**
  Becomes usable: Download notes (Markdown), download the full recording, and make a highlight reel of the kept moments.
  Why now: The export is what the dev fixes from and what makes the demo memorable.
  PRD ref: `prd.md > Features and Behavior > Export`
  Spec ref: `spec.md > Export`
  Build: notesMarkdown with unit test, downloads, makeReel with title cards and progress, muted to the speakers.
  Verify (mechanical): `npm test` passes the notes test; `npm run e2e` makes a reel and checks the downloaded file is a WebM with a duration.
  Learner check: Make a reel from a session with three moments and watch it. Do the title cards read well?
  Commit: `Export notes, full recording and a highlight reel`

- [ ] **6. Every awkward case says something helpful**
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

Activity and evidence: not started
Route and stops: not started
Edit outcome: not started
Reflection: not started
Activity mode: not started

## Revisions
