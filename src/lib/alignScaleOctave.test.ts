import { describe, expect, it } from "vitest";
import {
  alignExpectedMidisToDetectedOctave,
  bestOctaveShiftSemitones,
} from "@/lib/alignScaleOctave";
import { buildExerciseScaleMidis } from "@/lib/scales";

describe("alignScaleOctave", () => {
  it("shifts a high expected C major down to the played octave", () => {
    const high = buildExerciseScaleMidis(84, "major", 1); // C6
    const played = buildExerciseScaleMidis(60, "major", 1); // C4
    const notes = played.map((detectedMidi) => ({
      detectedMidi,
      missingData: false,
    }));

    expect(bestOctaveShiftSemitones(high, notes)).toBe(-2);
    expect(alignExpectedMidisToDetectedOctave(high, notes)).toEqual(played);
  });

  it("leaves an already-matching octave alone", () => {
    const midis = buildExerciseScaleMidis(60, "major", 1);
    const notes = midis.map((detectedMidi) => ({
      detectedMidi,
      missingData: false,
    }));
    expect(bestOctaveShiftSemitones(midis, notes)).toBe(0);
  });
});
