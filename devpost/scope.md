---
doc: scope
status: draft
---

> **How this draft was made.** At Harindu's request, the agent drafted this overnight on 24 Oct 2026 while Harindu was away, from Harindu's earlier plan for Flinch and research into the hackathon and earlier playtesting projects. The choices below are the agent's until Harindu reviews them. **Questions for Harindu** at the bottom turn this into Harindu's plan.

# Flinch

A browser playtest recorder that watches the player's face while they play and bookmarks the moments they got frustrated or delighted, so a solo game dev can jump straight to them.

## The Unique Kernel
Playtesters stay quiet; their faces don't. Flinch calibrates to each player's resting face for ten seconds, then turns their expressions into a live frustration/delight line next to the gameplay, and pins every spike as a bookmark you can replay with the game and face side by side. It all runs in one browser tab, and the video never leaves the laptop.

## Who It's For
Harindu: a solo indie game dev in Colombo who playtests with friends sitting next to them. Today Harindu watches over their shoulder, asks "was that fine?", and gets "yeah, it was fine." The moment the tester sighed at a jump goes unseen, because Harindu was watching the screen too. Paid services (PlaytestCloud charges about $120 per one-player video) are out of reach for every build.

## The Core Loop
1. Open Flinch, pick the game window, turn on the webcam, get the friend's consent.
2. Ten seconds of calm face to calibrate, then the friend plays.
3. Stop. Flinch shows the recording with a reaction line under it and pins on the spikes.
4. Click a pin to replay that moment (game and face together), type a note ("jump at 0:42 too far").
5. Export the moments: a short highlight reel and a notes file to fix from.

They come back with every new build: test, fix the top moments, test again, and see if the spike went away.

## Inspiration & Identity
- Feels like a video editor or a DAW: dark, calm, precise, timecodes in monospace, colored markers on a timeline.
- Red-ish for frustration, warm yellow-green for delight. The line should read in five seconds on a demo video.
- Prior art it must not copy: PatchLab (Hacklytics 2026 winner, https://devpost.com/software/patchlab) does studio-scale emotion playtesting with a desktop agent, Apple Watch, Snowflake and a cloud backend. Flinch is the opposite: nothing to install, no account, nothing uploaded, one friend on one laptop.
- Uses Google's MediaPipe Face Landmarker, which gives 52 facial expression scores ("blendshapes") per frame in the browser: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js

## Why This Matters to the Learner
Harindu playtests every game they ship (Drive Away, The Final Room, game-jam games) and friends rarely say what annoyed them. This is a tool for their own workflow first.

## What "Working" Looks Like
A friend plays a game (any window: a browser game or a Unity build) for two or three minutes. Harindu presses Stop and immediately sees a timeline where three or four pins sit on the moments the friend groaned or laughed. Clicking one plays the game clip and the friend's face together.
The "oh, that's cool" beat: the pin lands exactly on the jump the friend died on five times, and the face in the corner shows the eye-roll.

## The POC Boundary
- One tester, one session at a time, in Chrome on a laptop.
- Capture: one game window/screen + webcam + microphone, recorded as one video with the face picture-in-picture.
- Ten-second per-player calibration.
- Live frustration/delight line while recording; automatic bookmarks after Stop, plus a manual "mark" key.
- Review: player with timeline, pins, click to jump, a note per pin, dismiss a wrong pin.
- Export: highlight reel of the kept moments (WebM) and a Markdown notes file.
- Sessions kept on the laptop (browser storage) so a refresh doesn't lose a playtest.

## Later
- Comparing two builds' sessions side by side ("did the fix flatten the spike?").
- Game event markers sent from the game itself (deaths, level changes).
- Several testers merged into one heat map.

## Explicitly Cut
- Accounts, cloud upload, sharing links: the point is that nothing leaves the laptop.
- Heart rate or wearables: needs hardware most friends don't have.
- An AI chat over sessions: doesn't prove the kernel, and it would need a server and a key.
- Emotion labels beyond frustration and delight (surprise, boredom, confusion): more labels mean more wrong labels on a demo.

## Questions for Harindu (morning review)
1. Is "solo dev playtesting with a friend next to them" the right user, or should it be remote testers?
2. Is the highlight reel the right export, or do you just want the notes file?
3. Anything here you'd cut or rename?
