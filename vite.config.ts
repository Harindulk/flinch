import { cpSync } from "node:fs";
import { defineConfig } from "vite";

// MediaPipe loads its wasm at runtime from a URL; serve a copy from public/ so nothing comes from a CDN.
cpSync("node_modules/@mediapipe/tasks-vision/wasm", "public/wasm", { recursive: true });

export default defineConfig({ base: "./" });
