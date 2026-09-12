import { describe, expect, it } from "vitest";
import { deriveScaleStudioPhase, nextScaleTakeCopy } from "@/lib/scaleTakeLoop";

describe("nextScaleTakeCopy", () => {
  it("names the first recording as take 1", () => {
    expect(nextScaleTakeCopy(0)).toMatchObject({
      takeNumber: 1,
      label: "Take 1",
      hint: "Play the scale",
      ariaLabel: "Record take 1",
    });
  });

  it("names the next recording as another take", () => {
    expect(nextScaleTakeCopy(1)).toMatchObject({
      takeNumber: 2,
      label: "Take 2",
      hint: "Play it again",
      ariaLabel: "Record take 2",
      again: true,
    });
    expect(nextScaleTakeCopy(4).label).toBe("Take 5");
  });
});

describe("deriveScaleStudioPhase", () => {
  it("keeps the last take on screen while recording or analysing", () => {
    expect(
      deriveScaleStudioPhase({
        isRecording: true,
        analysing: false,
        hasSession: true,
      }),
    ).toBe("recording");
    expect(
      deriveScaleStudioPhase({
        isRecording: false,
        analysing: true,
        hasSession: true,
      }),
    ).toBe("analysing");
    expect(
      deriveScaleStudioPhase({
        isRecording: false,
        analysing: false,
        hasSession: true,
      }),
    ).toBe("results");
  });

  it("starts ready until the first take exists", () => {
    expect(
      deriveScaleStudioPhase({
        isRecording: false,
        analysing: false,
        hasSession: false,
      }),
    ).toBe("ready");
    expect(
      deriveScaleStudioPhase({
        isRecording: false,
        analysing: true,
        hasSession: false,
      }),
    ).toBe("analysing");
  });
});
