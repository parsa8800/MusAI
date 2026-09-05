import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMediaRecorder,
  pickRecorderMime,
  startMediaRecorder,
} from "../mediaRecorderMime";

describe("pickRecorderMime", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns undefined when MediaRecorder is missing", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    expect(pickRecorderMime()).toBeUndefined();
  });

  it("picks the first supported type", () => {
    vi.stubGlobal("MediaRecorder", {
      isTypeSupported: (t: string) => t === "audio/webm",
    });
    expect(pickRecorderMime()).toBe("audio/webm");
  });
});

describe("startMediaRecorder", () => {
  it("falls back when timeslice is rejected", () => {
    const recorder = {
      start: vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error("timeslice");
        })
        .mockImplementationOnce(() => undefined),
    } as unknown as MediaRecorder;
    startMediaRecorder(recorder);
    expect(recorder.start).toHaveBeenCalledTimes(2);
    expect(recorder.start).toHaveBeenLastCalledWith();
  });
});

describe("createMediaRecorder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when MediaRecorder is missing", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    expect(() => createMediaRecorder({} as MediaStream)).toThrow(/not available/i);
  });
});
