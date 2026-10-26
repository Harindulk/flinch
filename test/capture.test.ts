import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptureError, openCamera, pickWindow } from "../src/capture";

const fail = (name: string, message = "x") => () => Promise.reject(new DOMException(message, name));
const media = (getUserMedia: unknown, getDisplayMedia: unknown = fail("NotAllowedError")) => {
  vi.stubGlobal("window", { isSecureContext: true });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia, getDisplayMedia } });
};
const err = (p: Promise<unknown>) => p.then(() => null, (e: CaptureError) => e);

afterEach(() => vi.unstubAllGlobals());

describe("capture errors", () => {
  it("names every getUserMedia rejection with a next step", async () => {
    for (const name of ["NotAllowedError", "NotFoundError", "NotReadableError", "OverconstrainedError", "AbortError", "InvalidStateError", "SecurityError", "TypeError", "NotSupportedError", "UnknownError"]) {
      media(fail(name));
      const e = await err(openCamera());
      expect(e, name).toBeInstanceOf(CaptureError);
      expect(e!.message.length, name).toBeGreaterThan(30);
    }
  });

  it("keeps the wording the e2e suite checks", async () => {
    media(fail("NotAllowedError", "Permission denied"));
    expect((await err(openCamera()))!.message).toMatch(/blocked/i);
    media(fail("NotFoundError"));
    expect((await err(openCamera()))!.message).toMatch(/no webcam/i);
    expect((await err(pickWindow()))!.message).toMatch(/cancelled/i);
  });

  it("continues without the mic when only the mic fails", async () => {
    const cam = {} as MediaStream;
    const gum = vi.fn((c: MediaStreamConstraints) => (c.audio ? fail("NotAllowedError")() : Promise.resolve(cam)));
    media(gum);
    expect(await openCamera()).toBe(cam);
    expect(gum).toHaveBeenCalledTimes(2);
  });

  it("does not re-prompt after a dismissed prompt, and explains insecure pages", async () => {
    const gum = vi.fn(fail("NotAllowedError", "Permission dismissed"));
    media(gum);
    expect((await err(openCamera()))!.message).toMatch(/prompt was closed/);
    expect(gum).toHaveBeenCalledTimes(1);
    vi.stubGlobal("window", { isSecureContext: false });
    vi.stubGlobal("navigator", {});
    expect((await err(openCamera()))!.problem).toBe("unsupported");
  });
});
