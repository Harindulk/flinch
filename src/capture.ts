export type CaptureProblem = "denied" | "missing" | "unsupported" | "other";

export class CaptureError extends Error {
  constructor(public problem: CaptureProblem, message: string) {
    super(message);
  }
}

export function browserSupported(): boolean {
  return Boolean(
    typeof navigator.mediaDevices?.getDisplayMedia === "function" &&
      typeof MediaRecorder !== "undefined" &&
      typeof MediaStreamTrackProcessor !== "undefined" &&
      typeof Worker !== "undefined" &&
      typeof indexedDB !== "undefined",
  );
}

/** Chrome's own picker for the game window (or a screen). Asks for the game's sound too. */
export async function pickWindow(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
  } catch (e) {
    throw explain(e, "screen");
  }
}

export async function openCamera(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      // Raw-ish voice: noise suppression would flatten the groans and laughs we listen for.
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
    });
  } catch (e) {
    throw explain(e, "camera");
  }
}

export function stopStream(s?: MediaStream | null) {
  s?.getTracks().forEach((t) => t.stop());
}

function explain(e: unknown, what: "screen" | "camera"): CaptureError {
  const name = (e as DOMException)?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return what === "screen"
      ? new CaptureError("denied", "Screen sharing was cancelled or blocked. Click again and pick the game window.")
      : new CaptureError("denied", "Camera or microphone is blocked. Click the camera icon in Chrome's address bar, allow both, then try again.");
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return new CaptureError("missing", what === "screen" ? "No screen or window to share was found." : "No webcam or microphone found. Flinch needs a webcam to read reactions.");
  if (name === "NotSupportedError" || !window.isSecureContext)
    return new CaptureError("unsupported", "Chrome only allows the camera and screen sharing on a secure address. Open Flinch at http://localhost:5173 (or an https link), not a network IP.");
  if (name === "NotReadableError")
    return new CaptureError("other", `The ${what === "screen" ? "screen" : "camera"} is busy in another app. Close it there and try again.`);
  return new CaptureError("other", `Couldn't open the ${what}: ${(e as Error)?.message ?? e}`);
}
