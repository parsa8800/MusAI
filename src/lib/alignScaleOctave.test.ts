import { describe, expect, it } from "vitest";
import {
  alignExpectedMidisToDetectedOctave,
  bestOctaveShiftSemitones,
  staffFeedbackFromSession,
} from "@/lib/alignScaleOctave";
import { buildExerciseScaleMidis, defaultRootMidiForTonic } from "@/lib/scales";
import { formatNoteLabel } from "@/lib/intonation";

describe("defaultRootMidiForTonic", () => {
  it("defaults C major practice to C4 (MIDI 60)", () => {
    expect(defaultRootMidiForTonic(0)).toBe(60);
    expect(formatNoteLabel(defaultRootMidiForTonic(0))).toBe("C4");
  });

  it("defaults G major near G4, not a high start", () => {
    const g = defaultRootMidiForTonic(7);
    expect(g).toBe(67); // G4
    expect(g).toBeLessThan(80);
  });
});

describe("alignScaleOctave — no runaway highs", () => {
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

  it("does not jump C4 written notes up to C6/C7 from a few high outliers", () => {
    const written = buildExerciseScaleMidis(60, "major", 1);
    // Mostly C4 neighbourhood, with two noisy high detections (harmonics)
    const detected = written.map((m, i) =>
      i === 3 || i === 4 ? m + 24 : m,
    );
    const notes = detected.map((detectedMidi) => ({
      detectedMidi,
      missingData: false,
    }));
    const shift = bestOctaveShiftSemitones(written, notes);
    expect(shift).toBeLessThanOrEqual(0);
    const aligned = alignExpectedMidisToDetectedOctave(written, notes);
    expect(Math.max(...aligned)).toBeLessThanOrEqual(84); // not C7 territory for 1oct C
    expect(aligned[0]).toBe(60);
  });

  it("does shift up when the whole take is clearly an octave higher", () => {
    const written = buildExerciseScaleMidis(60, "major", 1); // C4
    const played = buildExerciseScaleMidis(72, "major", 1); // C5
    const notes = played.map((detectedMidi) => ({
      detectedMidi,
      missingData: false,
    }));
    expect(bestOctaveShiftSemitones(written, notes)).toBe(1);
    expect(alignExpectedMidisToDetectedOctave(written, notes)).toEqual(played);
  });
});

describe("staffFeedbackFromSession — detected notes display", () => {
  it("maps in-tune and sharp/flat cents onto ascending then descending", () => {
    const midis = buildExerciseScaleMidis(60, "major", 1);
    const notes = midis.map((expectedMidi, i) => ({
      noteIndex: i,
      expectedMidi,
      expectedNoteLabel: formatNoteLabel(expectedMidi),
      detectedMidi: expectedMidi,
      detectedNoteLabel: formatNoteLabel(expectedMidi),
      detectedHz: 440,
      centsDifference: i === 1 ? 35 : i === 2 ? -40 : 0,
      intonationBucket:
        i === 1 ? ("sharp" as const) : i === 2 ? ("flat" as const) : ("in_tune" as const),
      missingData: false,
    }));

    const feedback = staffFeedbackFromSession({
      expectedNotesMidi: midis,
      notes,
    });

    expect(feedback.displayMidis[0]).toBe(60);
    expect(feedback.displayMidis.every((m) => m >= 55 && m <= 100)).toBe(true);
    // Ascending portion of round-trip
    expect(feedback.ascendingCents[1]).toBe(35);
    expect(feedback.ascendingCents[2]).toBe(-40);
    expect(feedback.ascendingCents[0]).toBe(0);
  });

  it("keeps displayed scale labels in the C4–C5 band for a C4 take", () => {
    const midis = buildExerciseScaleMidis(60, "major", 1);
    const notes = midis.map((detectedMidi) => ({
      detectedMidi,
      missingData: false,
      centsDifference: 0,
    }));
    const { displayMidis } = staffFeedbackFromSession({
      expectedNotesMidi: midis,
      notes,
    });
    const labels = displayMidis.map((m) => formatNoteLabel(m));
    expect(labels[0]).toBe("C4");
    expect(labels.some((l) => /[67]$/.test(l))).toBe(false);
  });

  it("displays the octave that was actually played, matching detected midis", () => {
    const written = buildExerciseScaleMidis(60, "major", 1); // C4 practice default
    const played = buildExerciseScaleMidis(72, "major", 1); // clearly C5
    const notes = played.map((detectedMidi, i) => ({
      detectedMidi,
      missingData: false,
      centsDifference: i === 2 ? 25 : 0,
    }));
    const { displayMidis, ascendingCents } = staffFeedbackFromSession({
      expectedNotesMidi: written,
      notes,
    });
    expect(displayMidis).toEqual(played);
    expect(displayMidis.map((m) => formatNoteLabel(m))[0]).toBe("C5");
    expect(ascendingCents[2]).toBe(25);
    expect(Math.max(...displayMidis)).toBeLessThan(96); // not C7+
  });
});
