import { cpSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

// MediaPipe loads its wasm at runtime from a URL; serve a copy from public/ so nothing comes from a CDN.
cpSync("node_modules/@mediapipe/tasks-vision/wasm", "public/wasm", { recursive: true });

// tasks-vision 1.1 POSTs usage stats to Google every minute from the worker, where the page's CSP doesn't reach.
// An about: URL makes that fetch fail locally (MediaPipe catches it and stops trying), so nothing leaves the browser.
const TELEMETRY = "https://odml.pa.googleapis.com/v1/log";
const noTelemetry = (): Plugin => ({
  name: "flinch-no-mediapipe-telemetry",
  transform(code, id) {
    if (!id.includes("tasks-vision")) return;
    if (!code.includes(TELEMETRY)) return void this.warn("MediaPipe telemetry URL not found; check it is still off");
    return { code: code.replaceAll(TELEMETRY, "about:blank"), map: null };
  },
});

export default defineConfig({ base: "./", plugins: [noTelemetry()], worker: { plugins: () => [noTelemetry()] } });
