import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMicStream } from "../micStream";

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
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
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
        deviceId: { exact: "device-abc" },
      }),
    );
  });

  it("throws last error when all attempts fail", async () => {
    const err = new DOMException("denied", "NotAllowedError");
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(err);
    await expect(getMicStream(null)).rejects.toBe(err);
  });
});
