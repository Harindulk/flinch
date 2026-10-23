// Headless end-to-end run: Playwright's own Chromium (muted) with a fake camera, mic and screen.
// The camera fixture is MediaPipe's public test portrait, downloaded into e2e/out/ (gitignored).
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const OUT = new URL("./out/", import.meta.url).pathname;
const PORT = 5287;
const URL_ = `http://localhost:${PORT}/`;
mkdirSync(OUT, { recursive: true });

async function fixture() {
  const y4m = `${OUT}portrait.y4m`;
  if (existsSync(y4m)) return y4m;
  const res = await fetch("https://storage.googleapis.com/mediapipe-assets/portrait.jpg");
  writeFileSync(`${OUT}portrait.jpg`, Buffer.from(await res.arrayBuffer()));
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-loop", "1", "-i", `${OUT}portrait.jpg`, "-t", "4", "-r", "15",
    "-vf", "scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2", "-pix_fmt", "yuv420p", y4m]);
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
  if (camera === "face") args.push(`--use-file-for-fake-video-capture=${await fixture()}`);
  const browser = await chromium.launch({ args });
  browsers.push(browser);
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
  if (denyCamera) await context.grantPermissions([], { origin: URL_ });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
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
  await page.waitForSelector("#stop:not([disabled])");
  await page.waitForTimeout(3500);
  await page.click("#stop");
  await page.waitForSelector("#review[data-ready]", { timeout: 20000 });
  const d = await page.$$eval(".stage video", (vs) => vs.map((v) => v.duration));
  assert(d.length === 2 && d.every((x) => Number.isFinite(x) && x > 2), `video durations ${d}`);
  await page.screenshot({ path: `${OUT}review.png` });
});

for (const b of browsers) await b.close();
stopServer();
const failed = results.filter(([, r]) => r === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
