// Headless end-to-end run: Playwright's own Chromium (muted) with a fake camera, mic and screen.
// The camera fixture is MediaPipe's public test portrait, downloaded into e2e/out/ (gitignored).
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const OUT = new URL("./out/", import.meta.url).pathname;
const PORT = 5287;
// E2E_URL=http://host/path/ tests an already-running site (e.g. the build served under a sub-path, like GitHub Pages).
const URL_ = process.env.E2E_URL ?? `http://localhost:${PORT}/`;
mkdirSync(OUT, { recursive: true });

const FIT = "scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2,setsar=1";

async function asset(name) {
  const path = `${OUT}${name}`;
  if (!existsSync(path)) {
    const res = await fetch(`https://storage.googleapis.com/mediapipe-assets/${name}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  return path;
}

/**
 * "face": one smiling face, still. "reaction": a calm face for 17 s (calibration), a big smile
 * for 3 s, then calm again. Chrome loops the file, so the smile lands ~4–7 s into the recording.
 */
async function fixture(kind = "face") {
  const y4m = `${OUT}${kind}.y4m`;
  if (existsSync(y4m)) return y4m;
  const smile = await asset("portrait.jpg");
  if (kind === "face") {
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-loop", "1", "-i", smile, "-t", "4", "-r", "15", "-vf", FIT, "-pix_fmt", "yuv420p", y4m]);
    return y4m;
  }
  const calm = await asset("business-person.png");
  if (kind === "reaction-late") {
    // Like "reaction", but calm for 24 s: calibration stays clear of the smile even when the face model downloads slowly.
    execFileSync("ffmpeg", ["-loglevel", "error", "-y",
      "-loop", "1", "-t", "24", "-i", calm, "-loop", "1", "-t", "3", "-i", smile, "-loop", "1", "-t", "10", "-i", calm,
      "-filter_complex", `[0]${FIT}[a];[1]${FIT}[b];[2]${FIT}[c];[a][b][c]concat=n=3:v=1[v]`, "-map", "[v]", "-r", "15", "-pix_fmt", "yuv420p", y4m]);
    return y4m;
  }
  if (kind === "dim") {
    // The reaction video at about a third of the light, with less contrast: a dim room.
    const src = await fixture("reaction");
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", src, "-vf", "eq=brightness=-0.3:contrast=0.55,noise=alls=12:allf=t", "-pix_fmt", "yuv420p", y4m]);
    return y4m;
  }
  if (kind === "blips") {
    // Calm for calibration, then four 0.2 s smiles 3 s apart: twitches, not reactions.
    const parts = [["calm", 17]];
    for (let i = 0; i < 4; i++) parts.push(["smile", 0.2], ["calm", 2.8]);
    parts.push(["calm", 6]);
    const inputs = parts.flatMap(([who, t]) => ["-loop", "1", "-t", String(t), "-i", who === "calm" ? calm : smile]);
    const chains = parts.map((_, i) => `[${i}]${FIT}[p${i}]`).join(";");
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...inputs, "-filter_complex", `${chains};${parts.map((_, i) => `[p${i}]`).join("")}concat=n=${parts.length}:v=1[v]`,
      "-map", "[v]", "-r", "15", "-pix_fmt", "yuv420p", y4m]);
    return y4m;
  }
  if (kind === "two") {
    const HALF = "scale=320:480:force_original_aspect_ratio=decrease,pad=320:480:(ow-iw)/2:(oh-ih)/2,setsar=1";
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-loop", "1", "-t", "4", "-i", calm, "-loop", "1", "-t", "4", "-i", smile,
      "-filter_complex", `[0]${HALF}[a];[1]${HALF}[b];[a][b]hstack=inputs=2[v]`, "-map", "[v]", "-r", "15", "-pix_fmt", "yuv420p", y4m]);
    return y4m;
  }
  execFileSync("ffmpeg", ["-loglevel", "error", "-y",
    "-loop", "1", "-t", "17", "-i", calm, "-loop", "1", "-t", "3", "-i", smile, "-loop", "1", "-t", "10", "-i", calm,
    "-filter_complex", `[0]${FIT}[a];[1]${FIT}[b];[2]${FIT}[c];[a][b][c]concat=n=3:v=1[v]`, "-map", "[v]", "-r", "15", "-pix_fmt", "yuv420p", y4m]);
  return y4m;
}

// E2E_PREVIEW=1 tests the production build (npm run build first) instead of the dev server.
const server = process.env.E2E_URL ? null : spawn("npx", process.env.E2E_PREVIEW ? ["vite", "preview", "--port", String(PORT), "--strictPort"] : ["vite", "--port", String(PORT), "--strictPort"], { stdio: "pipe" });
const stopServer = () => server?.kill();
process.on("exit", stopServer);
if (server) await new Promise((ok, fail) => {
  server.stdout.on("data", (d) => String(d).includes("Local") && ok());
  setTimeout(() => fail(new Error("vite did not start")), 20000);
});

const only = process.argv[2];
const results = [];
const browsers = [];
async function launch({ camera = "face", denyCamera = false, init = null, block = null } = {}) {
  const args = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--auto-select-desktop-capture-source=Entire screen", "--mute-audio"];
  if (camera !== "pattern") args.push(`--use-file-for-fake-video-capture=${await fixture(camera)}`);
  // E2E_FULL=1 uses Playwright's full Chromium, which (unlike the headless shell) really hides background tabs.
  // Playwright normally disables Chrome's background throttling; keep Chrome's real behaviour.
  const ignoreDefaultArgs = ["--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"];
  const browser = await chromium.launch({ args, ignoreDefaultArgs });
  browsers.push(browser);
  const [vw, vh] = (process.env.E2E_VIEWPORT ?? "1440x900").split("x").map(Number); // e.g. E2E_VIEWPORT=1280x720
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: vw, height: vh } });
  // Headless Chromium can't show a real "Block" choice, so make getUserMedia fail the way a blocked camera does.
  if (denyCamera) await context.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
  });
  if (init) await context.addInitScript(init);
  if (block) await context.route(block, (r) => r.abort());
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  await page.addInitScript(() => addEventListener("unhandledrejection", (e) => console.error("unhandled: " + (e.reason?.stack ?? e.reason))));
  page.on("console", (m) => m.type() === "error" && console.log("  [console]", m.text()));
  await page.goto(URL_);
  return page;
}

async function test(name, fn) {
  if (only && !name.includes(only)) return;
  const t0 = Date.now();
  try {
    await fn();
    results.push([name, "PASS"]);
    console.log(`PASS ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    results.push([name, "FAIL"]);
    console.log(`FAIL ${name}: ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Home → setup → both sources on → consent → start. */
async function startPlaytest(page, { tester = "Kasun", build = "Test build 1" } = {}) {
  await page.click("#new-playtest");
  await page.click("#game-tile-btn");
  await page.click("#cam-tile-btn");
  await page.fill("#tester", tester);
  await page.fill("#build", build);
  await page.check("#consent");
  await page.waitForSelector("#calibrate:not([disabled])");
  await page.click("#calibrate");
}

await test("records game and face and plays them back", async () => {
  const page = await launch();
  await startPlaytest(page);
  await page.waitForSelector("#countdown", { timeout: 30000 });
  await page.waitForSelector(".face-check.yes", { timeout: 10000 });
  await page.waitForSelector("#stop:not([disabled])", { timeout: 30000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}record.png` });
  await page.click("#stop");
  await page.waitForSelector("#review[data-ready]", { timeout: 20000 }).catch(async (e) => {
    await page.screenshot({ path: `${OUT}stuck.png` });
    console.log("  status:", await page.textContent("#rec-status").catch(() => "(no record screen)"));
    console.log("  videos:", await page.$$eval(".stage video", (vs) => vs.map((v) => [v.readyState, v.duration, v.currentTime, v.error?.message])));
    throw e;
  });
  const d = await page.$$eval(".stage video", (vs) => vs.map((v) => v.duration));
  assert(d.length === 2 && d.every((x) => Number.isFinite(x) && x > 2), `video durations ${d}`);
  const faces = Number(await page.getAttribute("#review", "data-faces"));
  assert(faces > 30, `expected face samples during 4 s of recording, got ${faces}`);
  assert(await page.isVisible("#no-moments"), "a calm session should say there were no big reactions");
  await page.screenshot({ path: `${OUT}review.png` });
});

await test("pins a smile and a manual mark, and clicking a pin replays it", async () => {
  const page = await launch({ camera: "reaction" });
  await startPlaytest(page);
  await page.waitForSelector("#stop:not([disabled])", { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.keyboard.press("m");
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${OUT}record-reaction.png` });
  const stoppedAt = Date.now();
  await page.click("#stop");
  await page.waitForSelector("#review[data-ready]", { timeout: 30000 }).catch(async (e) => {
    await page.screenshot({ path: `${OUT}stuck2.png` });
    console.log("  status:", await page.textContent("#rec-status").catch(() => "(no record screen)"));
    throw e;
  });
  const stopToReady = (Date.now() - stoppedAt) / 1000;
  assert(stopToReady < 7, `review took ${stopToReady}s to get ready`);
  assert(await page.isVisible("#fresh"), "a fresh session should announce what was found");
  await page.waitForFunction(() => document.querySelector(".moment.selected"), null, { timeout: 5000 });
  const openedAt = await page.$eval(".stage video.game", (v) => v.currentTime);
  const [mm, ss] = (await page.textContent(".moment.selected .time")).split(":").map(Number);
  const expected = Math.max(0, mm * 60 + ss - 3); // 3 s lead-in, clamped at the start
  assert(Math.abs(openedAt - expected) < 1.5, `review should open 3 s before the strongest moment (${mm}:${ss}), opened at ${openedAt}`);
  const kinds = await page.$$eval(".moment", (els) => els.map((e) => e.dataset.kind));
  assert(kinds.includes("delight"), `expected a delight moment, got [${kinds}]`);
  assert(kinds.includes("mark"), `expected a manual mark, got [${kinds}]`);
  assert(!kinds.includes("frustration"), `a smile should not pin frustration: [${kinds}]`);
  assert(await page.$eval(".moment.delight img", (i) => i.src.startsWith("data:image/jpeg")), "delight moment has no thumbnail");
  await page.click(".moment.delight .kind");
  await page.waitForFunction(() => !document.querySelector(".stage video.game").paused, null, { timeout: 5000 });
  const t = await page.$eval(".stage video.game", (v) => v.currentTime);
  assert(t > 0.5, `expected the player to jump to the moment, at ${t}`);
  await page.waitForTimeout(1500);
  const drift = await page.$$eval(".stage video", ([g, f]) => Math.abs(g.currentTime - f.currentTime));
  assert(drift < 0.3, `face video drifted ${drift.toFixed(2)} s from the game`);
  await page.screenshot({ path: `${OUT}review-reaction.png` });

  const [notes] = await Promise.all([page.waitForEvent("download"), page.click("#download-notes")]);
  await notes.saveAs(`${OUT}notes.md`);
  const md = readFileSync(`${OUT}notes.md`, "utf8");
  assert(md.includes("| Possible delight |") && md.includes("| Your mark |"), `notes file:\n${md}`);

  const recDownloads = [];
  page.on("download", (d) => recDownloads.push(d));
  await page.click("#download-recording");
  await page.waitForTimeout(1500);
  page.removeAllListeners("download");
  assert(recDownloads.length === 2, `expected game + face files, got ${recDownloads.length}`);
  for (const d of recDownloads) {
    const path = `${OUT}${d.suggestedFilename()}`;
    await d.saveAs(path);
    const st = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name", "-of", "json", path])).streams;
    assert(d.suggestedFilename().endsWith(".webm") && st.some((x) => x.codec_type === "video" && /vp8|vp9/.test(x.codec_name)), `${d.suggestedFilename()}: ${JSON.stringify(st)}`);
  }

  const [reel] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.click("#make-reel")]);
  const reelPath = `${OUT}reel.${reel.suggestedFilename().split(".").pop()}`;
  await reel.saveAs(reelPath);
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,nb_read_frames", "-of", "json", reelPath]));
  const v = probe.streams.find((x) => x.codec_type === "video");
  // Intro 1.5 s + two cards of 1 s + two clips of up to 6 s, at up to 30 fps.
  assert(v && v.nb_read_frames > 100, `reel video frames: ${JSON.stringify(probe.streams)}`);
  assert(probe.streams.some((x) => x.codec_type === "audio"), "reel has no audio track");
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-ss", "4", "-i", reelPath, "-frames:v", "1", `${OUT}reel-frame.png`]);
});

await test("keeps playtests and notes after a refresh, and deletes them", async () => {
  const page = await launch({ camera: "reaction" });
  await startPlaytest(page, { tester: "Nimali", build: "Save test" });
  await page.waitForSelector("#stop:not([disabled])", { timeout: 30000 });
  await page.waitForTimeout(9000);
  await page.click("#stop");
  await page.waitForSelector("#review[data-ready]", { timeout: 30000 });
  await page.fill(".moment.delight textarea", "Grinned at the drift jump");
  await page.waitForTimeout(600);
  assert(page.url().includes("#/review/"), `url ${page.url()}`);
  await page.reload();
  await page.waitForSelector("#review[data-ready]", { timeout: 20000 });
  const note = await page.inputValue(".moment.delight textarea");
  assert(note === "Grinned at the drift jump", `note after reload: "${note}"`);
  await page.click("button:has-text('Playtests')");
  await page.waitForSelector(".session-row");
  const rows = await page.$$eval(".session-row .title", (els) => els.map((e) => e.textContent));
  assert(rows.length === 1 && rows[0] === "Nimali · Save test", `rows ${rows}`);
  page.once("dialog", (d) => d.accept());
  await page.click(".session-row button:has-text('Delete')");
  await page.waitForFunction(() => !document.querySelector(".session-row"));
  await page.reload();
  await page.waitForSelector("#new-playtest");
  assert(!(await page.$(".session-row")), "deleted session came back after reload");
});

await test("explains a blocked camera", async () => {
  const page = await launch({ denyCamera: true });
  await page.click("#new-playtest");
  await page.click("#cam-tile-btn");
  await page.waitForSelector("#cam-tile.error");
  const msg = await page.textContent("#cam-tile .tile-msg");
  assert(/blocked/i.test(msg), `message: ${msg}`);
  assert(await page.isDisabled("#calibrate"), "Calibrate should stay disabled");
});

// AXE=/path/to/axe.min.js runs the axe accessibility checker on every screen (not part of the normal run).
async function axe(page, name) {
  if (!process.env.AXE) return;
  await page.addScriptTag({ path: process.env.AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations
    .map((x) => `${x.impact} ${x.id}: ${x.nodes.length}× ${x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`));
  console.log(`  [axe ${name}] ${v.length ? "\n    " + v.join("\n    ") : "no violations"}`);
}

await test("screens (visual check)", async () => {
  const page = await launch({ camera: "reaction" });
  await page.screenshot({ path: `${OUT}s1-home-empty.png` });
  await axe(page, "s1-home-empty");
  await page.click("#new-playtest");
  await page.screenshot({ path: `${OUT}s2-setup-empty.png` });
  await axe(page, "s2-setup-empty");
  await page.click("#game-tile-btn");
  await page.click("#cam-tile-btn");
  await page.fill("#tester", "Kasun");
  await page.fill("#build", "Drive Away 0.9");
  await page.check("#consent");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}s3-setup-ready.png` });
  await axe(page, "s3-setup-ready");
  await page.click("#calibrate");
  await page.waitForSelector("#countdown", { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}s4-calibrating.png` });
  await axe(page, "s4-calibrating");
  await page.waitForSelector("#stop:not([disabled])", { timeout: 30000 });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}s5-recording.png` });
  await axe(page, "s5-recording");
  await page.waitForTimeout(3000);
  await page.click("#stop");
  await page.waitForSelector("#review[data-ready]", { timeout: 30000 });
  await page.click(".moment.delight .kind");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}s6-review.png` });
  await axe(page, "s6-review");
  await page.click("button:has-text('Playtests')");
  await page.waitForSelector(".session-row");
  await page.screenshot({ path: `${OUT}s7-home-list.png` });
  await axe(page, "s7-home-list");
});

await test("explains a cancelled screen share and a missing webcam", async () => {
  const page = await launch({ init: () => {
    navigator.mediaDevices.getDisplayMedia = () => Promise.reject(new DOMException("Permission denied by user", "NotAllowedError"));
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Requested device not found", "NotFoundError"));
  } });
  await page.click("#new-playtest");
  await page.click("#game-tile-btn");
  await page.waitForSelector("#game-tile.error");
  assert(/cancelled/i.test(await page.textContent("#game-tile .tile-msg")), "screen message");
  await page.click("#cam-tile-btn");
  await page.waitForSelector("#cam-tile.error");
  assert(/no webcam/i.test(await page.textContent("#cam-tile .tile-msg")), "camera message");
  assert(/choose the game window/.test(await page.textContent("#missing")), "start button should say what's missing");
});

await test("recovers when the face model can't load", async () => {
  const page = await launch({ block: "**/models/face_landmarker.task" });
  await startPlaytest(page);
  await page.waitForSelector("#face-error", { timeout: 30000 });
  await page.context().unroute("**/models/face_landmarker.task");
  await page.click("#retry-reader");
  await page.waitForSelector("#countdown", { timeout: 30000 });
});

await test("handles a one-second session", async () => {
  const page = await launch();
  await startPlaytest(page);
  await page.waitForSelector("#stop:not([disabled])", { timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.click("#stop");
  await page.waitForSelector("#review[data-ready]", { timeout: 20000 });
  assert(/too short/.test(await page.textContent("#no-moments")), "short-session message");
});

await test("notices two faces and warns before a refresh loses a recording", async () => {
  const page = await launch({ camera: "two" });
  await startPlaytest(page);
  await page.waitForSelector("#face-check.warn", { timeout: 30000 });
  assert(/two faces/i.test(await page.textContent("#face-check")), "calibration should mention two faces");
  await page.waitForSelector("#stop:not([disabled])", { timeout: 30000 });
  await page.waitForFunction(() => /2 faces/.test(document.querySelector("#face-chip")?.textContent ?? ""), null, { timeout: 5000 });
  const dialog = page.waitForEvent("dialog", { timeout: 5000 });
  await page.close({ runBeforeUnload: true });
  const d = await dialog;
  assert(d.type() === "beforeunload", `dialog ${d.type()}`);
  await d.dismiss();
});

await test("releases the camera and screen when you leave or finish", async () => {
  const track = () => {
    window.__streams = [];
    for (const k of ["getUserMedia", "getDisplayMedia"]) {
      const orig = navigator.mediaDevices[k].bind(navigator.mediaDevices);
      navigator.mediaDevices[k] = async (c) => { const s = await orig(c); window.__streams.push(s); return s; };
    }
  };
  const live = (page) => page.evaluate(() => window.__streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState === "live").length);
  const page = await launch({ init: track });
  await page.click("#new-playtest");
  await page.click("#game-tile-btn");
  await page.click("#cam-tile-btn");
  await page.waitForSelector("#cam-tile.ok");
  assert((await live(page)) >= 2, "expected live tracks after setup");
  await page.click("button:has-text('Back')");
  assert((await live(page)) === 0, `tracks still live after Back: ${await live(page)}`);
  await startPlaytest(page);
  await page.waitForSelector("#stop:not([disabled])", { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.click("#stop");
  await page.waitForSelector("#review[data-ready]", { timeout: 20000 });
  assert((await live(page)) === 0, `tracks still live after Stop: ${await live(page)}`);
});

await test("ignores brief twitches (noisy expressions)", async () => {
  const page = await launch({ camera: "blips" });
  await startPlaytest(page);
  await page.waitForSelector("#stop:not([disabled])", { timeout: 30000 });
  await page.waitForTimeout(12000);
  await page.click("#stop");
  await page.waitForSelector("#review[data-ready]", { timeout: 20000 });
  const kinds = await page.$$eval(".moment", (els) => els.map((e) => e.dataset.kind));
  console.log(`  (pins from four 0.2 s smiles: [${kinds}])`);
  await page.screenshot({ path: `${OUT}blips.png` });
  assert(kinds.length === 0, `twitches became pins: [${kinds}]`);
});

await test("copes with a dim room", async () => {
  const page = await launch({ camera: "dim" });
  await startPlaytest(page);
  const outcome = await Promise.race([
    page.waitForSelector("#stop:not([disabled])", { timeout: 30000 }).then(() => "recording"),
    page.waitForSelector("#calib-failed", { timeout: 30000 }).then(() => "asked to retry"),
  ]);
  if (outcome === "recording") {
    await page.waitForTimeout(9000);
    await page.click("#stop");
    await page.waitForSelector("#review[data-ready]", { timeout: 20000 });
  }
  const kinds = await page.$$eval(".moment", (els) => els.map((e) => e.dataset.kind));
  console.log(`  (dim room: ${outcome}; pins [${kinds}])`);
  await page.screenshot({ path: `${OUT}dim.png` });
});

await test("keeps the recording reachable when browser storage is blocked", async () => {
  const page = await launch({ init: () => { indexedDB.open = () => { throw new DOMException("blocked", "SecurityError"); }; } });
  await page.waitForSelector(".sessions .notice");
  await startPlaytest(page);
  await page.waitForSelector("#stop:not([disabled])", { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.click("#stop");
  await page.waitForSelector("#unsaved", { timeout: 20000 });
  const downloads = [];
  page.on("download", (d) => downloads.push(d));
  await page.click("#unsaved button");
  await page.waitForTimeout(1200);
  assert(downloads.length === 2, `expected 2 downloads from the banner, got ${downloads.length}`);
});

await test("keeps a reaction that happens while the page stutters", async () => {
  // Stand-in for a busy or background page: three 1 s stalls of the page's own thread while the
  // tester smiles. (Automated Chromium never reports a tab as hidden, so a real background tab
  // can't be reproduced here.) Live face reads that go missing are read back from the recording.
  const page = await launch({ camera: "reaction-late" }); // the smile lands 4–12 s in
  await startPlaytest(page);
  await page.waitForSelector("#stop:not([disabled])", { timeout: 30000 });
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(1000);
    await page.evaluate(() => { const t = performance.now(); while (performance.now() - t < 1000) {} });
  }
  await page.waitForTimeout(14000); // long enough that the fixture's smile is inside the recording even on a slow model load
  await page.click("#stop");
  await page.waitForSelector("#review[data-ready]", { timeout: 30000 });
  const faces = Number(await page.getAttribute("#review", "data-faces"));
  const gap = Number(await page.getAttribute("#review", "data-max-gap"));
  const d = await page.$$eval(".stage video", (vs) => vs.map((v) => v.duration));
  const kinds = await page.$$eval(".moment", (els) => els.map((e) => e.dataset.kind));
  console.log(`  (three 1 s stalls: ${faces} face samples, largest gap ${gap.toFixed(2)} s, recordings ${d.map((x) => x.toFixed(1))} s, pins [${kinds}])`);
  assert(gap <= 0.65, `face samples have a ${gap} s hole (gaps over 0.6 s should be filled)`);
  assert(d.every((x) => x > 9), `recordings lost time: ${d}`);
  assert(kinds.includes("delight"), "the smile during the stalls was lost");
});

// SOAK_MIN=10 npm run e2e -- soak : a long recording, sampling memory (not part of the normal run).
if (process.env.SOAK_MIN) await test("soak: memory over a long recording", async () => {
  const minutes = Number(process.env.SOAK_MIN);
  const page = await launch({ camera: "reaction" });
  await startPlaytest(page);
  await page.waitForSelector("#stop:not([disabled])", { timeout: 30000 });
  const rssMb = () => {
    const rows = execFileSync("ps", ["-A", "-o", "pid=,ppid=,rss="]).toString().trim().split("\n").map((l) => l.trim().split(/\s+/).map(Number));
    const mine = new Set([process.pid]);
    for (let grew = true; grew; ) { grew = false; for (const [pid, ppid] of rows) if (mine.has(ppid) && !mine.has(pid)) { mine.add(pid); grew = true; } }
    return Math.round(rows.filter(([pid]) => mine.has(pid) && pid !== process.pid).reduce((n, [, , rss]) => n + rss, 0) / 1024);
  };
  const log = [];
  for (let m = 0; m <= minutes * 2; m++) {
    const heap = await page.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1048576));
    log.push({ min: m / 2, heapMb: heap, browserRssMb: rssMb() });
    console.log(`  ${(m / 2).toFixed(1)} min: JS heap ${heap} MB, browser processes ${log.at(-1).browserRssMb} MB`);
    if (m < minutes * 2) await page.waitForTimeout(30000);
  }
  const t0 = Date.now();
  await page.click("#stop");
  await page.waitForSelector("#review[data-ready]", { timeout: 120000 });
  const got = [];
  page.on("download", (d) => got.push(d));
  await page.click("#download-recording");
  await page.waitForTimeout(3000);
  let bytes = 0;
  for (const d of got) { const p = `${OUT}soak-${d.suggestedFilename()}`; await d.saveAs(p); bytes += readFileSync(p).length; }
  const summary = { minutes, stopToReviewS: (Date.now() - t0) / 1000, recordingMb: Math.round(bytes / 1048576), mbPerMin: +(bytes / 1048576 / minutes).toFixed(1), afterStopRssMb: rssMb(), log };
  writeFileSync(`${OUT}soak.json`, JSON.stringify(summary, null, 2));
  console.log(`  stop→review ${summary.stopToReviewS}s; recordings ${summary.recordingMb} MB (${summary.mbPerMin} MB/min)`);
});

await test("saves the playtest even when gap filling fails", async () => {
  const page = await launch();
  await startPlaytest(page, { tester: "Gapfail", build: "Save test" });
  await page.waitForSelector("#stop:not([disabled])", { timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => { const t = performance.now(); while (performance.now() - t < 1500) {} }); // makes a gap
  await page.waitForTimeout(1000);
  await page.context().route("**/models/face_landmarker.task", (r) => r.abort()); // the gap filler can't load
  await page.click("#stop");
  await page.waitForSelector("#review[data-ready]", { timeout: 30000 });
  assert(!(await page.$("#unsaved")), "the session should still have been saved");
  await page.click("button:has-text('Playtests')");
  await page.waitForSelector(".session-row");
  assert((await page.textContent(".session-row .title")).includes("Gapfail"), "saved session not listed");
});

await test("landing: pins replay, a note is kept, questions answer, the form fills setup", async () => {
  const page = await launch();
  await page.waitForSelector(".d-row.on");
  await page.waitForTimeout(4700);
  assert((await page.getAttribute(".d-row.on", "data-i")) === "1", "the demo should move to the next pin on its own");
  await page.click(".d-row.delight");
  await page.waitForTimeout(2900);
  assert((await page.textContent(".d-caption")).includes("Possible delight"), "caption should name the replayed moment");
  const mouth = await page.getAttribute(".f-mouth", "d");
  assert(mouth.startsWith("M45 63"), `the face should smile at the delight moment, mouth ${mouth}`);
  assert((await page.textContent(".d-clock")).startsWith("1:52"), `the clock should end 1 s after the moment: ${await page.textContent(".d-clock")}`);
  await page.click(".d-row.frustration");
  await page.waitForTimeout(1000);
  await page.click(".d-row.delight"); // cut the frustration replay short
  // The old replay's frown was due ~0.95 s after this click; the new smile is due at ~1.95 s. Halfway: still at rest.
  await page.waitForTimeout(1450);
  const between = await page.getAttribute(".f-mouth", "d");
  assert(between.startsWith("M48 66"), `a cut-short replay must not leave its frown on the next one (mouth ${between})`);
  await page.waitForTimeout(1100);
  assert((await page.getAttribute(".f-mouth", "d")).startsWith("M45 63"), "the delight replay should end on a smile");
  await page.fill(".m-card.open .m-note", "Shorter jump");
  await page.click(".m-card.open button");
  assert((await page.$$eval(".m-card.kept", (els) => els.map((e) => e.textContent))).some((t) => t.includes("Shorter jump")), "the note should be kept");
  await page.click(".q-q >> nth=6");
  assert((await page.textContent(".q-pane")).includes("free and open source"), "FAQ pane should answer the cost question");
  await page.fill("#cta-tester", "Nimal");
  await page.fill("#cta-build", "Fail Hard 1.2");
  await page.click("#start button[type=submit]");
  await page.waitForSelector("#tester");
  assert((await page.inputValue("#tester")) === "Nimal" && (await page.inputValue("#build")) === "Fail Hard 1.2", "setup should be prefilled");
});

await test("try it on your own face: live line, a pinned smile with a snapshot, camera off after", async () => {
  const track = () => {
    window.__streams = [];
    const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => { const s = await orig(c); window.__streams.push(s); return s; };
  };
  const page = await launch({ camera: "reaction", init: track });
  await page.click("#try-camera");
  await page.waitForFunction(() => /Hold still/.test(document.querySelector("#try-say").textContent), null, { timeout: 15000 });
  const audio = await page.evaluate(() => window.__streams.flatMap((s) => s.getAudioTracks()).length);
  assert(audio === 0, "the try-it should not ask for the microphone");
  await page.waitForSelector(".y-pin.delight", { timeout: 40000 });
  assert((await page.getAttribute(".y-pin.delight img", "src")).startsWith("data:image/jpeg"), "the pin should carry a snapshot of the face");
  await page.locator("#try").screenshot({ path: `${OUT}try-it.png` });
  await page.click("#try-stop");
  const live = await page.evaluate(() => window.__streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState === "live").length);
  assert(live === 0, `camera still on after Turn it off: ${live} live tracks`);
});

await test("compares two builds on Review", async () => {
  // Two playtests in one browser: the first catches a smile, the second stays calm.
  const page = await launch({ camera: "reaction" });
  await startPlaytest(page, { tester: "Kasun", build: "Build A" });
  await page.waitForSelector("#stop:not([disabled])", { timeout: 30000 });
  await page.waitForTimeout(10000);
  await page.click("#stop");
  await page.waitForSelector("#review[data-ready]", { timeout: 30000 });
  assert(await page.isHidden(".cmp-bar"), "with one playtest there is nothing to compare");
  await page.click("button:has-text('Playtests')");
  await startPlaytest(page, { tester: "Kasun", build: "Build B" });
  await page.waitForSelector("#stop:not([disabled])", { timeout: 30000 });
  await page.waitForTimeout(3000); // still in the calm stretch of the clip
  await page.click("#stop");
  await page.waitForSelector("#review[data-ready]", { timeout: 30000 });
  await page.waitForSelector(".cmp-bar:not([hidden])");
  const value = await page.$eval("#compare option:nth-child(2)", (o) => o.value);
  await page.selectOption("#compare", value);
  const text = await page.textContent("#compare-summary");
  console.log(`  (${text.replace(/\s+/g, " ").trim()})`);
  assert(/This playtest: .*0 possible delights/.test(text) && /Build A · Kasun · .*1 possible delight/.test(text), `summary: ${text}`);
  await page.screenshot({ path: `${OUT}compare.png` });
});

await test("asks to retry calibration when no face is visible", async () => {
  const page = await launch({ camera: "pattern" });
  await startPlaytest(page);
  await page.waitForSelector("#calib-failed", { timeout: 40000 });
  await page.waitForSelector("#retry");
});

for (const b of browsers) await b.close();
stopServer();
const failed = results.filter(([, r]) => r === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
