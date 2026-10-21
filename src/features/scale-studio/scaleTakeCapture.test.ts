import { afterEach, describe, expect, it, vi } from "vitest";
import { awaitRecorderChunks } from "@/lib/mediaRecorderMime";
import {
  messageForQuietTake,
  messageForUnheardScaleTake,
  SCALE_TAKE_FAILED,
  SCALE_TAKE_MIN_BYTES,
  SCALE_TAKE_NO_PITCH,
  SCALE_TAKE_NO_SCALE,
  SCALE_TAKE_QUIET,
  SCALE_TAKE_UNREADABLE,
  readScaleTakeStatus,
  scaleTakeStatusText,
} from "@/lib/scaleTakeCapture";

describe("scale take retry status", () => {
  it("stays a short headline plus one hint", () => {
    for (const status of [
      SCALE_TAKE_QUIET,
      SCALE_TAKE_NO_PITCH,
      SCALE_TAKE_NO_SCALE,
      SCALE_TAKE_FAILED,
      SCALE_TAKE_UNREADABLE,
    ]) {
      expect(status.headline.length).toBeLessThan(28);
      expect(status.hint.length).toBeLessThan(28);
      expect(status.headline).not.toMatch(/[.!?]/);
      expect(status.hint).not.toMatch(/[.!?]/);
      expect(readScaleTakeStatus(scaleTakeStatusText(status))).toEqual(status);
    }
  });
});

describe("messageForQuietTake", () => {
  it("explains an empty or near-silent recording", () => {
    expect(messageForQuietTake(0)).toBe(SCALE_TAKE_QUIET);
    expect(messageForQuietTake(SCALE_TAKE_MIN_BYTES - 1)).toBe(SCALE_TAKE_QUIET);
    expect(messageForQuietTake(Number.NaN)).toBe(SCALE_TAKE_QUIET);
  });

  it("lets a real recording through", () => {
    expect(messageForQuietTake(SCALE_TAKE_MIN_BYTES)).toBeNull();
    expect(messageForQuietTake(48_000)).toBeNull();
  });
});

describe("messageForUnheardScaleTake", () => {
  it("names a take with no pitch", () => {
    expect(
      messageForUnheardScaleTake({ notesAnalyzed: 0, heardPitch: false }),
    ).toBe(SCALE_TAKE_NO_PITCH);
  });

  it("names a take that never became a scale", () => {
    expect(
      messageForUnheardScaleTake({ notesAnalyzed: 0, heardPitch: true }),
    ).toBe(SCALE_TAKE_NO_SCALE);
  });

  it("stays quiet once notes were scored", () => {
    expect(
      messageForUnheardScaleTake({ notesAnalyzed: 4, heardPitch: true }),
    ).toBeNull();
  });
});

describe("awaitRecorderChunks", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps audio that arrives after the stop event", async () => {
    vi.useFakeTimers();
    const chunks: Blob[] = [];
    const listeners = new Map<string, Array<() => void>>();
    const recorder = {
      state: "recording" as RecordingState,
      mimeType: "audio/webm",
      addEventListener(type: string, fn: () => void) {
        const list = listeners.get(type) ?? [];
        list.push(fn);
        listeners.set(type, list);
      },
      stop() {
        this.state = "inactive";
        listeners.get("stop")?.forEach((fn) => fn());
        setTimeout(() => {
          chunks.push(new Blob([new Uint8Array(400)]));
        }, 10);
      },
    };

    const pending = awaitRecorderChunks(
      recorder as unknown as MediaRecorder,
      chunks,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(chunks).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(60);
    await expect(pending).resolves.toBe("stopped");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.size).toBeGreaterThanOrEqual(SCALE_TAKE_MIN_BYTES);
  });
});
