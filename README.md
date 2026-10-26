# Flinch

Find the gameplay moments your playtesters couldn't put into words.

Flinch is a free, local-first playtest recorder for game developers. It records the game window and the tester's webcam and mic in one browser tab, calibrates to the tester's resting face, and pins the moments their expression changed: possible frustration, possible delight, and your own marks. After the session you click a pin and watch the game and the face from three seconds before.

**Live:** https://flinch.starfungames.com/ (desktop Chrome, a webcam, and a game in another window).

Flinch measures facial movement against the tester's own resting face. It does not detect emotions or feelings. A pin says where to look; you decide what it meant.

## Run it from a clean checkout

Needs Node 22 (Vite 8 needs 20.19+ or 22.12+), desktop Chrome and a webcam.

```bash
npm ci
npm run dev        # http://localhost:5173
```

Camera and screen sharing only work on `localhost` or an `https://` address; a LAN IP over plain http is refused by Chrome, and Flinch says so.

`npm run dev` and `npm run build` copy MediaPipe's wasm files from `node_modules` into `public/wasm/` (gitignored), so the app never loads anything from a CDN.

## Use it

1. Open your game in its own window (a browser game, a Unity or Godot build, an emulator). Keep Flinch in a separate window, not a background tab.
2. In Flinch: **New playtest** → **Choose game window** → **Turn on camera & mic** → tester name and build → the tester ticks the consent box → **Calibrate and start**.
3. The tester relaxes for ten seconds while Flinch learns their resting face, then plays. Press **M** to drop your own marker.
4. Press **Stop** (or stop sharing from Chrome's bar). Review opens with a reaction timeline and pins.
5. Click a pin or a moment to replay it from three seconds before. Add a note, or dismiss a pin that wasn't a reaction. Pick another saved playtest to compare two builds.
6. Export: **Notes (.md)** (a Markdown fix list), **Recording** (the game and face files, WebM), **Highlight reel** (MP4 when Chrome can record it, WebM otherwise; the app names the format it made).

The landing page also has **Try it on your own face**: the real face reader on your webcam, with nothing recorded and the camera turned off when you stop or leave.

## Privacy

- Everything runs in the browser. There is no account, no server, no analytics, and no upload. The page, the face model (`public/models/`) and the wasm runtime are served from the same site.
- Playtests (video, face scores, notes) are stored in this browser's IndexedDB until you delete them from the home screen. Exports are ordinary downloads.
- The page sets a Content-Security-Policy (`index.html`) that only allows same-origin scripts, workers, styles, images and connections, plus `blob:`/`data:`/`mediastream:` for local media, and `no-referrer`.
- MediaPipe's `tasks-vision` 1.1 contains a usage logger that POSTs task stats to `odml.pa.googleapis.com` from the worker, where the page's CSP doesn't apply. `vite.config.ts` rewrites that URL at build time so the request fails inside the browser and is never sent.
- The tester ticks a consent box before anything is recorded. Get their agreement before you share a recording.

## Tested on

- **Automated:** Playwright's headless Chromium with a fake camera, mic and screen (`npm run e2e`), against the dev server and the production build.
- **Target:** desktop Chrome. Edge is Chromium-based and uses the same APIs, but has not been tested.
- **Not supported:** Firefox and Safari (no `MediaStreamTrackProcessor`); Flinch says so on the home screen. Phones and tablets can't share a game window.

## Known limits

- **Background tabs.** Live face reads run on the page's own thread, because Chrome (tested on v156) can't transfer camera tracks to a worker. If the page stalls or Chrome throttles it, Flinch reads the missing stretches back from the face recording after Stop. A page frozen for many seconds also stalls Chrome's recorders, and that stretch can't be recovered. Automated Chromium never reports a tab as hidden, so a truly hidden Flinch tab has only been checked by hand, not in CI.
- **Face reading measures movement, not feelings.** A frown of concentration, a squint at a bright screen or talking can all move the score. Thresholds are starting points (`src/moments.ts`). A lost face (turned away, poor light) shows as a gap, and a second face in view gets a warning.
- **Memory.** Recordings are held in memory until Stop: up to about 20 MB a minute of real gameplay (7 MB a minute in the 10-minute soak test, whose fake screen compresses easily). In that soak the JS heap stayed flat at 10 MB and Stop → Review took about 4 s. Flinch suggests stopping after 20 minutes.
- **Formats.** Session recordings are WebM, which has no duration in its header; some players show it as unknown. The highlight reel is MP4 where Chrome can record it.

## Tests

```bash
npm run lint    # strict TypeScript checks
npm test        # unit tests (Vitest): signals, moments, gaps, capture errors, compare, notes export
npm run e2e     # headless Chromium, muted, fake camera/mic/screen: 19 journeys incl. failure paths
npm run build && E2E_PREVIEW=1 npm run e2e   # the same against the production build
SOAK_MIN=10 npm run e2e -- soak             # a 10-minute recording, sampling memory
E2E_URL=https://host/path/ npm run e2e      # against a site that's already running
```

`npm run e2e` needs `ffmpeg` on the PATH, Playwright's Chromium (`npx playwright-core install chromium`), and internet once: it downloads two of MediaPipe's public test images into `e2e/out/` and splices them into a fake camera video (a calm face, then a smile), so the path from face to pin to reel runs without a real webcam.

## How it works

- **Two recordings.** Chrome's MediaRecorder records the game window (with its sound) and the webcam (with the mic) as two WebM files, natively rather than drawn by the page, so recording continues while the game covers Flinch. Review plays them in sync with the face in a corner.
- **Face reading.** [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js) runs in a Web Worker about 15 times a second and returns blendshape scores (0–1 values for movements such as brows down or smile).
- **Two signals.** `src/signals.ts` turns those into possible frustration (brows down, frown, pressed lips, nose wrinkle, squint) and possible delight (smile, raised cheeks), measured in spreads above the tester's resting face, smoothed, with a resting level that drifts slowly so steady concentration doesn't fill the timeline.
- **Moments.** `src/moments.ts` pins places where a signal stays 2.5 spreads above rest for at least half a second, boosts ones where the mic was loud, merges moments closer than five seconds, and keeps the strongest twelve plus your marks.
- **Gap filling.** `src/backfill.ts` reads missed stretches back from the face recording after Stop.
- **Highlight reel.** `src/export.ts` plays each kept moment (3 s before to 3 s after) into a canvas recorder after a title card, with the reaction line underneath. Sound goes into the file only, not the speakers.

## Project layout

```
src/
  main.ts, nav.ts          app start and screen switching
  capture.ts               window share, camera + mic, error messages
  recorder.ts              the two MediaRecorders
  face.ts, face.worker.ts  MediaPipe face reading in a worker
  signals.ts               blendshapes → scores, calibration
  moments.ts, backfill.ts  moment finder, gap filling
  timeline.ts, compare.ts  live strip, review timeline, compare builds
  player.ts, thumbs.ts     synced playback, moment thumbnails
  store.ts                 IndexedDB sessions and videos
  export.ts                notes Markdown and the highlight reel
  screens/, landing/       home (landing page), setup, record, review
test/                      unit tests
e2e/run.mjs                end-to-end run
public/models/             MediaPipe face landmarker model
devpost/                   planning docs
```

## Deploying

It's a static site: `npm run build` and serve `dist/` over https. `.github/workflows/pages.yml` can publish it to GitHub Pages on every push to `main` once Pages is set to "GitHub Actions". The app uses relative paths (`base: "./"`), so it also works under a sub-path.

## How it was built

Built for Devpost's Build With AI: Basics hackathon (October 2026) with Claude Code (Anthropic), following the Devpost Learn skill pack. Most of the code, tests and docs were written by Claude Code agents from a scope, PRD and spec worked out with the developer; the plan and a record of every change to it are in `devpost/` (`scope.md`, `prd.md`, `spec.md`, `checklist.md`).

## Credits and licence

- [`@mediapipe/tasks-vision`](https://www.npmjs.com/package/@mediapipe/tasks-vision) and the Face Landmarker model (`public/models/face_landmarker.task`) are Google's, Apache-2.0.
- The landing page's scroll engine (`src/landing/scrollcraft.js`) is [scroll-craft](https://github.com/nateherkai/scroll-craft) by Nate Herk, MIT, vendored unmodified with its licence beside it.
- Landing page photographs, via Wikimedia Commons (credited in the page footer too):
  - "GitarFreaks and DrumMania V cabinets and player" by David Monniaux, CC BY-SA 3.0 ([source](https://commons.wikimedia.org/w/index.php?curid=426169))
  - "Global Game Jam 2012" by Laboratório Criação Digital, CC BY-SA 2.0 ([source](https://commons.wikimedia.org/w/index.php?curid=26510609))
  - "Video Game Design on Paper at Game Jam" by I G, CC BY 2.0 ([source](https://commons.wikimedia.org/w/index.php?curid=101557348))
  - "LAN Party" by Stuballew, CC BY-SA 3.0 ([source](https://commons.wikimedia.org/w/index.php?curid=17848626))
- Everything else: MIT, see `LICENSE`.
