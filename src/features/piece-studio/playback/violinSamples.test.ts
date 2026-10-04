import { describe, expect, it } from "vitest";
import {
  VIOLIN_SAMPLE_NOTES,
  violinSampleBuffers,
} from "@/features/piece-studio/playback/violinSamples";

describe("violin listen samples", () => {
  it("maps each recorded note to a local file", () => {
    const buffers = violinSampleBuffers();
    expect(Object.keys(buffers)).toEqual([...VIOLIN_SAMPLE_NOTES]);
    expect(buffers.A4).toBe("/audio/violin/A4.m4a");
    expect(buffers.G3).toBe("/audio/violin/G3.m4a");
    expect(buffers.C7).toBe("/audio/violin/C7.m4a");
  });
});
