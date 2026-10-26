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
    // Keep the Flinch tab out of Chrome's picker: recording ourselves records nothing useful.
    const opts: DisplayMediaStreamOptions & { selfBrowserSurface?: string } = { video: { frameRate: 30 }, audio: true, selfBrowserSurface: "exclude" };
    return await navigator.mediaDevices.getDisplayMedia(opts);
  } catch (e) {
    throw explain(e, "screen");
  }
}

const VIDEO = { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" };

/** Just the camera, for the landing page's try-it: no microphone prompt for a ten-second demo. */
export async function openCameraOnly(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ video: VIDEO });
  } catch (e) {
    throw explain(e, "camera");
  }
}

export async function openCamera(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: VIDEO,
      // Raw-ish voice: noise suppression would flatten the groans and laughs we listen for.
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
    });
  } catch (e) {
    // No microphone, or only the mic is blocked: the face alone still works, just without the loudness boost.
    const name = (e as DOMException)?.name;
    const dismissed = /dismiss/i.test(String((e as Error)?.message));
    if (name === "NotFoundError" || (name === "NotAllowedError" && !dismissed) || name === "NotReadableError")
      try {
        return await navigator.mediaDevices.getUserMedia({ video: VIDEO });
      } catch (e2) {
        throw explain(e2, "camera");
      }
    throw explain(e, "camera");
  }
}

export function stopStream(s?: MediaStream | null) {
  s?.getTracks().forEach((t) => t.stop());
}

const INSECURE = "Chrome only allows the camera and screen sharing on a secure address. Open Flinch at http://localhost:5173 (or an https link), not a network IP.";

// Every rejection getUserMedia / getDisplayMedia can give, with what to do next.
function explain(e: unknown, what: "screen" | "camera"): CaptureError {
  const name = (e as DOMException)?.name;
  const msg = String((e as Error)?.message ?? "");
  const screen = what === "screen";
  if (!window.isSecureContext || !navigator.mediaDevices) return new CaptureError("unsupported", INSECURE);
  if (name === "NotAllowedError" || name === "SecurityError") {
    if (!screen && /dismiss/i.test(msg))
      return new CaptureError("denied", "Chrome's permission prompt was closed. Turn the camera on again and choose Allow.");
    if (/system/i.test(msg))
      return new CaptureError("denied", screen
        ? "Screen sharing is blocked by macOS. Open System Settings › Privacy & Security › Screen & System Audio Recording, turn on Chrome, restart Chrome, then choose the game window again."
        : "The camera is blocked by macOS. Open System Settings › Privacy & Security › Camera (and Microphone), turn on Chrome, restart Chrome, then try again.");
    return screen
      ? new CaptureError("denied", "Screen sharing was cancelled. Click Choose game window again, pick the game's window in Chrome's list, then click Share.")
      : new CaptureError("denied", "The camera is blocked for this site. In Chrome, click the icon at the left of the address bar, open Site settings, set Camera and Microphone to Allow, then turn the camera on again (reload the page if it still fails). Browsers built into other apps often can't use the camera at all: open Flinch in Chrome.");
  }
  if (name === "NotFoundError")
    return new CaptureError("missing", screen ? "No screen or window to share was found. Open the game, then choose its window again." : "No webcam found. Plug one in, then turn the camera on again. Flinch needs a webcam to read expressions.");
  if (name === "OverconstrainedError")
    return new CaptureError("missing", screen ? "That window can't be recorded. Pick a different window." : "This webcam can't give a usable picture. Plug in a different webcam and try again.");
  if (name === "NotReadableError")
    return new CaptureError("other", screen
      ? "Chrome couldn't start recording that window. Pick it again; if it keeps failing, restart Chrome."
      : "The camera is busy in another app (Zoom, Teams, FaceTime, OBS or another tab). Close it there, then turn the camera on again.");
  if (name === "InvalidStateError")
    return new CaptureError("other", `Keep this tab in front and click the button again to ${screen ? "choose the game window" : "turn on the camera"}.`);
  if (name === "AbortError")
    return new CaptureError("other", `The ${screen ? "screen share" : "camera"} stopped before it started. Click the button to try again; if it keeps failing, restart Chrome.`);
  if (name === "NotSupportedError" || name === "TypeError")
    return new CaptureError("unsupported", "This browser can't do that. Flinch needs desktop Chrome or Edge.");
  return new CaptureError("other", `Couldn't open the ${screen ? "game window" : "camera"}${msg ? `: ${msg}` : "."} Try again.`);
}
