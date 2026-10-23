---
doc: spec
status: draft
---

> **How this draft was made.** Drafted overnight by the agent on 24 Oct 2026, at Harindu's request, while Harindu was away. The stack is the agent's recommendation, not yet agreed by Harindu. It was checked early: a headless Chromium probe on 24 Oct ran the face model on a fake camera (face found, smile score 0.95), opened a fake screen share, and recorded a canvas to WebM.

# Flinch — Technical Spec

## How This Works, In Plain Language
Flinch is a web page with no server behind it. Everything happens inside Chrome on the dev's laptop.

- **Two inputs.** Chrome's screen-share picker gives a live video of the game window. The webcam and microphone give the tester's face and voice.
- **The mixer.** Many times a second, the page paints the game onto a hidden drawing surface (a canvas) and paints the face in a rounded corner on top. Chrome's built-in recorder (MediaRecorder) turns that canvas plus the sound into one video file.
- **The face reader.** Google's MediaPipe Face Landmarker runs on the camera video about 15 times a second. For each frame it returns 52 numbers between 0 and 1 ("blendshapes"), such as how much the brows are pulled down or how much the mouth is smiling.
- **The signal maker.** A small piece of our own code mixes those numbers into two scores: frustration (brows down, frown, pressed lips, nose wrinkle, squint) and delight (smile, raised cheeks). During the ten-second calibration it learns this tester's resting level for each score. After that it reports how far above their own resting face they are, so a naturally frowny face doesn't count as frustrated.
- **The moment finder.** After Stop, it looks for the places where a score stayed clearly above rest for at least half a second. A loud sound from the tester at the same time makes the moment stronger. It merges moments closer than five seconds and keeps the strongest twelve.
- **The shelf.** The browser's built-in database (IndexedDB) keeps each session: the video, the score samples, the moments, notes and thumbnails. It stays on this laptop.
- **Review and export.** The review page plays the video, draws the score lines and pins, and writes notes. The highlight reel is made by playing each moment's clip into another canvas recorder with a title card in front.

Why this shape: no server means no hosting, no upload, and no keys. That is the privacy promise, and it keeps the build small.

## The Core Journey Through the System
PRD ref: `prd.md > The Core Journey`.
1. Home → `store.listSessions()` reads IndexedDB and renders the list.
2. Setup → `capture.pickWindow()` calls `getDisplayMedia`; `capture.openCamera()` calls `getUserMedia({video, audio})`. Previews are `<video>` tags. The consent box and both sources enable Calibrate.
3. Calibrate → `face.start()` loads the model from `/models` and the wasm from `/wasm`, reads the camera at about 15 fps; `signals.calibrate()` collects ten seconds of frames and returns a per-signal mean and spread. Fewer than 40% of frames with a face → retry message.
4. Record → `compositor` paints game plus face to a 1280×720 canvas; `recorder` records the canvas stream plus mixed audio (mic + game audio) in one-second chunks; each face frame becomes a sample `{t, frustration, delight, loud, face}` with `t` in seconds from record start. Every second a 160×90 JPEG thumbnail of the canvas is kept. The live strip draws the last 30 s of samples. M adds a manual mark.
5. Stop (button, or the shared window's track ending) → chunks become one Blob; `moments.find(samples, marks)` returns the pins; `store.saveSession()` writes everything; the router opens Review.
6. Review → the video plays from an object URL of the stored Blob; `timeline` draws the lines and pins; clicking a pin seeks to `t − 3`. Notes and dismissals call `store.updateMoment()`.
7. Export → `exportNotes()` builds Markdown and downloads it; `makeReel()` plays each kept moment into a canvas recorder with a 1-second title card; full recording downloads the stored Blob.

## Stack
- **TypeScript 5.9 + Vite 8**, no UI framework. A few screens and one data shape don't need React; plain DOM keeps the build and the code tour small. Docs: https://vite.dev/guide/
- **@mediapipe/tasks-vision 1.1.1** (Apache-2.0), Face Landmarker with blendshapes, CPU delegate. Docs: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js
- Model `face_landmarker.task` (float16, 3.7 MB) committed under `public/models/`; the wasm files are copied from the package into `public/wasm/` when Vite starts. No CDN at runtime.
- Browser APIs: `getDisplayMedia`, `getUserMedia`, `HTMLCanvasElement.captureStream`, `MediaRecorder` (WebM VP9/Opus, falling back to VP8), Web Audio (`AnalyserNode` for loudness, `MediaStreamAudioDestinationNode` for mixing), IndexedDB. Docs: https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API, https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder, https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- **Vitest 5** for the pure logic (signals, moments, notes). **playwright-core** driving the already-installed Chromium headless shell with fake camera/screen flags for an end-to-end check. Docs: https://vitest.dev/, https://playwright.dev/docs/api/class-browsertype

## Where It Runs and How Someone Tries It
- Desktop Chrome or Edge (Chromium). Needs a webcam. Node 20+ to run the dev server.
- Start: `npm install`, then `npm run dev`, open http://localhost:5173.
- Demo recording: open a game in another window (a browser game or a Unity build), run Flinch, pick that window, record a friend for 2–3 minutes, then show Review and the reel. Screen-record Flinch itself with macOS Screenshot (Cmd+Shift+5).
- Optional deployment: it is a static site, so `npm run build` output (`dist/`) can go on GitHub Pages for a link anyone can open. Screen and camera need HTTPS, which Pages provides. Harindu decides at ship time.
- Tests: `npm test` (unit), `npm run e2e` (headless, muted, fake camera and screen).

## Look and Feel
From `prd.md > Look and Feel`.
- Colors (CSS variables): background `#111214`, panels `#1a1c20`, lines `#2a2d33`, text `#ecebe6`, muted text `#8d8f96`; frustration `#ff5d5d`; delight `#b8f35a`; manual mark `#ffb547`.
- Type: system UI font for text, `ui-monospace` for timecodes and numbers. Big buttons (44 px tall), 8 px radius.
- Calm and precise like a video editor: flat panels, thin borders, no gradients or glow. Copy is short and plain ("Pick the game window", "Relax and look at the screen").

## Components

### App shell and router
`src/main.ts`: holds the current screen (home, setup, record, review) and swaps the content of `#app`. No URL routing except `#/review/<id>` so a refresh on Review returns there.
PRD ref: `prd.md > Screens and Layout`.

### Capture
`src/capture.ts`: opens the window share and the camera+mic, reports clear errors (denied, no device, unsupported), and notices when sharing ends.
PRD ref: `prd.md > Features and Behavior > Capture`, `prd.md > States and Boundaries`.

### Compositor and recorder
`src/recorder.ts`: draws the game (letterboxed) and the face corner onto a 1280×720 canvas at 30 fps, mixes mic and game audio, records with MediaRecorder in one-second chunks, and takes a thumbnail each second.
PRD ref: `prd.md > Features and Behavior > Capture`.

### Face reader
`src/face.ts`: loads the Face Landmarker once and calls a callback with the blendshape scores (or "no face") for each processed camera frame, about 15 per second.
PRD ref: `prd.md > Features and Behavior > Calibration`, `> Live reaction line`.

### Signal maker
`src/signals.ts` (pure, unit-tested): `rawSignals(blendshapes)` → `{frustration, delight}`; `calibrate(frames)` → baseline mean and spread per signal (spread has a floor so a perfectly still face doesn't make tiny changes look huge); `score(raw, baseline)` → how many spreads above rest, smoothed.
PRD ref: `prd.md > Features and Behavior > Calibration`, `> Automatic bookmarks`.

### Loudness meter
Inside `src/recorder.ts`: an AnalyserNode on the mic gives a loudness value per face frame; calibration also learns resting loudness. "Loud" means well above that.
PRD ref: `prd.md > Features and Behavior > Automatic bookmarks`.

### Moment finder
`src/moments.ts` (pure, unit-tested): finds runs above the threshold lasting at least 0.5 s, gives each a peak time and strength (with the loudness boost), merges moments within 5 s, keeps the top 12, adds manual marks, sorts by time.
PRD ref: `prd.md > Features and Behavior > Automatic bookmarks`.

### Live strip and review timeline
`src/timeline.ts`: one canvas drawing function used by both the live strip (last 30 s) and the review timeline (whole session, with pins and a playhead). Gaps where there was no face.
PRD ref: `prd.md > Features and Behavior > Live reaction line`, `> Review and notes`.

### Session store
`src/store.ts`: a thin IndexedDB wrapper: `listSessions`, `getSession`, `saveSession`, `updateMoment`, `deleteSession`. Two object stores: `sessions` (everything but the video) and `videos` (the Blob by session id).
PRD ref: `prd.md > Features and Behavior > Saved sessions`.

### Export
`src/export.ts`: `notesMarkdown(session)` (pure, unit-tested) and `makeReel(session, blob, onProgress)`, which plays each kept moment (3 s before to 3 s after) into a canvas recorder after a one-second title card, with audio routed through Web Audio into the recording only (nothing plays on the speakers).
PRD ref: `prd.md > Features and Behavior > Export`.

### Screens
`src/screens/home.ts`, `setup.ts`, `record.ts`, `review.ts`: build the DOM for each screen and wire it to the pieces above.
PRD ref: `prd.md > Screens and Layout`, `prd.md > The Core Journey`.

## Data Model
```ts
type Sample = { t: number; f: number; d: number; loud: number; face: boolean }; // f, d = calibrated scores
type Moment = { id: string; t: number; kind: "frustration" | "delight" | "mark";
                strength: number; thumb?: string; note: string; dismissed: boolean };
type Session = { id: string; tester: string; build: string; createdAt: number; duration: number;
                 mimeType: string; samples: Sample[]; moments: Moment[]; thumbs: string[] /* one per second */ };
```
- Lives in IndexedDB (`flinch` database): `sessions` keyed by `id`, `videos` keyed by the same `id` holding the Blob.
- Written once at Stop; notes and dismissals update the session record immediately.
- Leaving and coming back: Home lists sessions; `#/review/<id>` reopens one. Deleting removes both records.
- Size: a 3-minute session is about 15–40 MB of video plus under 1 MB of samples and thumbnails.

## File Structure
```
flinch/
├── index.html              # single page; mounts #app
├── src/
│   ├── main.ts             # router + screen switching
│   ├── capture.ts          # window share, camera + mic, error messages
│   ├── recorder.ts         # compositor canvas, audio mix, loudness, MediaRecorder, thumbnails
│   ├── face.ts             # MediaPipe Face Landmarker wrapper
│   ├── signals.ts          # blendshapes → frustration/delight, calibration, scoring (pure)
│   ├── moments.ts          # moment finder (pure)
│   ├── timeline.ts         # live strip + review timeline drawing
│   ├── store.ts            # IndexedDB sessions + videos
│   ├── export.ts           # notes Markdown (pure) + highlight reel
│   ├── format.ts           # timecode helpers (pure)
│   ├── screens/            # home, setup, record, review
│   └── styles.css
├── test/                   # vitest unit tests for the pure modules
├── e2e/run.mjs             # headless end-to-end run with fake camera + screen
├── public/models/face_landmarker.task   # committed model (Apache-2.0)
├── public/wasm/            # copied from node_modules at startup (gitignored)
├── devpost/                # Devpost learning workspace
├── vite.config.ts, tsconfig.json, package.json
├── LICENSE                 # MIT
└── README.md
```

## External Services and Dependencies
None at runtime. No API, no key, no network call after the page loads. `npm install` fetches the packages; the face model was downloaded once from https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task and committed.

## Important Failure Modes
- **Camera, mic or screen permission denied** → the tile explains what was blocked and how to allow it; Calibrate stays disabled.
- **Face not found (bad light, too far)** → calibration asks to retry; during recording the line shows gaps and a "face lost" label.
- **IndexedDB write fails (quota, private window)** → a banner with a Download recording button so the playtest isn't lost.
- **The shared window closes mid-session** → treated as Stop; whatever was recorded is saved.

## What Was Simplified and Why
- **Plain DOM** instead of React — four screens don't need a framework, and the code tour stays readable.
- **Two hand-tuned formulas over blendshapes** instead of a trained emotion model — explainable, needs no data, and calibration does the per-person work. A trained classifier would need labelled playtest footage.
- **The reel is recorded in real time** (a 4-moment reel takes about 30 s) instead of cutting the WebM file — browsers can't cut WebM without a big library like ffmpeg.wasm.
- **One tester per session** — merging testers needs session alignment by game events, which is deferred.

## Decisions and Open Issues
- [agent] No server and nothing uploaded: the privacy promise is part of the product (`prd.md > Non-Goals`).
- [agent] Plain TypeScript + Vite; MediaPipe on CPU (GPU delegate is faster, but CPU proved to work headless and on all Macs).
- [agent] Thresholds start at 2.5 spreads above rest for 0.5 s; tune on a real playtest. **Genuine unknown:** whether these thresholds catch real reactions without flooding pins. Check: Harindu records one real session and counts pins against what he saw. Unit tests lock the logic; the numbers stay easy to change in `src/moments.ts`.
- Open (can wait): the reel's sound on or off by default (`prd.md > Open Questions`).
