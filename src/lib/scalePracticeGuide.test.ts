import { describe, expect, it } from "vitest";
import {
  buildScalePracticeGuideModel,
  scaleRecordingTips,
} from "@/lib/scalePracticeGuide";

describe("scaleRecordingTips", () => {
  it("asks for a clear ascent when the scale is up only", () => {
    expect(scaleRecordingTips(false)[0]).toMatch(/going up/i);
    expect(scaleRecordingTips(false).join(" ")).toMatch(/quiet/i);
  });

  it("asks for up then down when the scale goes both ways", () => {
    expect(scaleRecordingTips(true)[0]).toMatch(/up, then back down/i);
  });
});

describe("buildScalePracticeGuideModel", () => {
  it("includes up-and-down recording tips by default", () => {
    const model = buildScalePracticeGuideModel(0, "major", 60, 1);
    expect(model.recordingTips[0]).toMatch(/up, then back down/i);
  });
});
