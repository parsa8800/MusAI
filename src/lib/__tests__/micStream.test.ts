import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeMicOpenError,
  getMicStream,
  MicUnavailableError,
} from "../micStream";

describe("getMicStream", () => {
  const fakeStream = { id: "mock-stream" } as unknown as MediaStream;

  beforeEach(() => {
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves when getUserMedia succeeds on first try", async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValueOnce(
      fakeStream,
    );
    const s = await getMicStream(null);
    expect(s).toBe(fakeStream);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: true,
      video: false,
    });
  });

  it("retries with looser constraints after failure", async () => {
    const gum = vi.mocked(navigator.mediaDevices.getUserMedia);
    gum.mockRejectedValueOnce(new Error("constraint"));
    gum.mockResolvedValueOnce(fakeStream);

    const s = await getMicStream(null);
    expect(s).toBe(fakeStream);
    expect(gum.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("passes deviceId when provided", async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValueOnce(
      fakeStream,
    );
    await getMicStream("device-abc");
    const firstArg = vi.mocked(navigator.mediaDevices.getUserMedia).mock
      .calls[0]![0] as MediaStreamConstraints;
    expect(firstArg.audio).toEqual(
      expect.objectContaining({
        deviceId: { ideal: "device-abc" },
      }),
    );
  });

  it("throws last error when all attempts fail", async () => {
    const err = new DOMException("denied", "NotAllowedError");
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(err);
    await expect(getMicStream(null)).rejects.toBe(err);
  });

  it("throws MicUnavailableError when getUserMedia is missing", async () => {
    vi.stubGlobal("navigator", { mediaDevices: {} });
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    await expect(getMicStream(null)).rejects.toBeInstanceOf(MicUnavailableError);
  });
});

describe("describeMicOpenError", () => {
  it("explains permission denial", () => {
    expect(
      describeMicOpenError(new DOMException("denied", "NotAllowedError")),
    ).toMatch(/blocked/i);
  });

  it("uses MicUnavailableError message", () => {
    const err = new MicUnavailableError("Open Chrome.", "unsupported");
    expect(describeMicOpenError(err)).toBe("Open Chrome.");
  });
});
