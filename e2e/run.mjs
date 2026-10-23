// Headless end-to-end run: Playwright's own Chromium (muted) with a fake camera, mic and screen.
// The camera fixture is MediaPipe's public test portrait, downloaded into e2e/out/ (gitignored).
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const OUT = new URL("./out/", import.meta.url).pathname;
const PORT = 5287;
const URL_ = `http://localhost:${PORT}/`;
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
  execFileSync("ffmpeg", ["-loglevel", "error", "-y",
    "-loop", "1", "-t", "17", "-i", calm, "-loop", "1", "-t", "3", "-i", smile, "-loop", "1", "-t", "10", "-i", calm,
    "-filter_complex", `[0]${FIT}[a];[1]${FIT}[b];[2]${FIT}[c];[a][b][c]concat=n=3:v=1[v]`, "-map", "[v]", "-r", "15", "-pix_fmt", "yuv420p", y4m]);
  return y4m;
}

const server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { stdio: "pipe" });
const stopServer = () => server.kill();
process.on("exit", stopServer);
await new Promise((ok, fail) => {
  server.stdout.on("data", (d) => String(d).includes("Local") && ok());
  setTimeout(() => fail(new Error("vite did not start")), 20000);
});

const only = process.argv[2];
const results = [];
const browsers = [];
async function launch({ camera = "face", denyCamera = false } = {}) {
  const args = ["--use-fake-device-for-media-stream", "--auto-select-desktop-capture-source=Entire screen", "--mute-audio"];
  if (!denyCamera) args.push("--use-fake-ui-for-media-stream");
  if (camera !== "pattern") args.push(`--use-file-for-fake-video-capture=${await fixture(camera)}`);
  const browser = await chromium.launch({ args });
  browsers.push(browser);
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
  if (denyCamera) await context.grantPermissions([], { origin: URL_ });
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
  const kinds = await page.$$eval(".moment", (els) => els.map((e) => e.dataset.kind));
  assert(kinds.includes("delight"), `expected a delight moment, got [${kinds}]`);
  assert(kinds.includes("mark"), `expected a manual mark, got [${kinds}]`);
  assert(!kinds.includes("frustration"), `a smile should not pin frustration: [${kinds}]`);
  assert(await page.$eval(".moment.delight img", (i) => i.src.startsWith("data:image/jpeg")), "delight moment has no thumbnail");
  await page.click(".moment.delight .kind");
  await page.waitForFunction(() => !document.querySelector(".stage video.game").paused, null, { timeout: 5000 });
  const t = await page.$eval(".stage video.game", (v) => v.currentTime);
  assert(t > 0.5, `expected the player to jump to the moment, at ${t}`);
  await page.screenshot({ path: `${OUT}review-reaction.png` });

  const [notes] = await Promise.all([page.waitForEvent("download"), page.click("#download-notes")]);
  await notes.saveAs(`${OUT}notes.md`);
  const md = readFileSync(`${OUT}notes.md`, "utf8");
  assert(md.includes("| Delight |") && md.includes("| Marked |"), `notes file:\n${md}`);

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
  await page.click("text=← Playtests");
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
