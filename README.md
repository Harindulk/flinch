# Flinch

A browser playtest recorder for game devs. It records the game window and the tester's face together, learns the tester's resting face, and pins the moments they got frustrated or delighted, so you can jump straight to them after the session.

Everything runs in one Chrome tab. Recordings and face data stay in the browser on your computer; nothing is uploaded.

## Run it

Needs Node 20+, desktop Chrome or Edge, and a webcam.

```bash
npm install
npm run dev
```

Open http://localhost:5173. Camera and screen sharing only work on `localhost` or an `https://` address.

## Optional: a live link

`.github/workflows/pages.yml` builds the static site and publishes it to GitHub Pages on every push to `main`, once Pages is set to "GitHub Actions" in the repository settings. Pages serves over https, so camera and screen sharing work there.

## Use it

1. Open your game in another window (a browser game, a Unity build, an emulator).
2. In Flinch: **New playtest** → **Choose game window** → **Turn on camera & mic** → type the tester's name and the build → the tester ticks the consent box → **Calibrate and start**.
3. The tester relaxes for ten seconds while Flinch learns their resting face, then plays. Press **M** to drop your own marker at any time.
4. Press **Stop** (or stop sharing from Chrome's bar). Review opens with a reaction timeline and pins on the biggest moments.
5. Click a pin or a moment to replay it from three seconds before. Write a note, or mark it "Not a reaction".
6. Export: **Download notes** (Markdown fix list), **Download recording** (game and face files), **Make highlight reel** (a short video of the kept moments with title cards).

Playtests are kept in the browser (IndexedDB) until you delete them from the home screen.

## How it works

- **Two recordings.** Chrome's MediaRecorder records the game window (with its sound) and the webcam (with the mic) as two WebM files. They're recorded natively rather than drawn by the page, so recording continues while the game window covers Flinch. Review plays them in sync with the face in a corner.
- **Face reading.** [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js) runs in a Web Worker on the camera frames, about 15 times a second, and returns blendshape scores (0–1 values for facial movements such as brows down or smile).
- **Two signals.** `src/signals.ts` turns those into frustration (brows down, frown, pressed lips, nose wrinkle, squint) and delight (smile, raised cheeks). Each is measured in "spreads" above the tester's own resting face from the ten-second calibration, smoothed, with a resting level that drifts slowly so steady concentration doesn't count as frustration.
- **Moments.** `src/moments.ts` pins places where a signal stays 2.5 spreads above rest for at least half a second, boosts the ones where the mic was loud (a groan, a laugh), merges moments closer than five seconds, and keeps the strongest twelve plus your manual marks.
- **Highlight reel.** `src/export.ts` plays each kept moment (3 s before to 3 s after) into a canvas recorder after a title card, drawing the reaction line underneath. It records MP4 where Chrome supports it, WebM otherwise. Sound goes into the file only, not the speakers.

## Limits

- Desktop Chrome or Edge only (Firefox and Safari lack the insertable-streams API the face worker uses; Flinch says so on the home screen).
- Recordings stay in memory until Stop, about 20 MB a minute; Flinch suggests stopping after 20 minutes.
- Session recordings are WebM. The highlight reel is MP4 when the browser can record it, otherwise WebM, and the app says which.
- Pins mark facial-expression changes, not feelings. Thresholds are starting points (`src/moments.ts`).

## Tests

```bash
npm test        # unit tests: signals, moments, notes export
npm run e2e     # headless Chromium (muted) with a fake camera, mic and screen: 11 journeys incl. failures
npm run build && E2E_PREVIEW=1 npm run e2e   # the same against the production build
```

The end-to-end run downloads two of MediaPipe's public test images into `e2e/out/` and splices them into a fake camera video (a calm face, then a smile), so the whole path from face to pin to reel is exercised without a real webcam.

## Project layout

```
src/
  main.ts, nav.ts        app start and screen switching
  capture.ts             window share, camera + mic, error messages
  recorder.ts            the two MediaRecorders
  face.ts, face.worker.ts  MediaPipe face reading off the main thread
  signals.ts             blendshapes → frustration/delight, calibration, scoring
  moments.ts             moment finder
  timeline.ts            live strip and review timeline drawing
  player.ts, thumbs.ts   synced playback, moment thumbnails
  store.ts               IndexedDB sessions and videos
  export.ts              notes Markdown and the highlight reel
  screens/               home, setup, record, review
test/                    unit tests
e2e/run.mjs              end-to-end run
public/models/           MediaPipe face landmarker model
devpost/                 planning docs from the Devpost Learn skill pack
```

## Planning docs

Built for Devpost's Build With AI: Basics hackathon with the Devpost Learn skill pack and Claude Code. The plan is in `devpost/`: `scope.md`, `prd.md`, `spec.md`, and the build checklist `checklist.md` (with a record of every change to the plan during the build).

## Credits and licence

- `@mediapipe/tasks-vision` and `public/models/face_landmarker.task` are Google's, Apache-2.0.
- Everything else: MIT, see `LICENSE`.
