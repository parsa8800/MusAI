import { describe, expect, it } from "vitest";
import {
  appendAttemptForExercise,
  buildTakeSummaries,
  compareTakeNotes,
  countUnresolvedNotes,
  exerciseConfigKey,
  filterAttemptsForExercise,
  inferExerciseMotion,
  sameScaleExercise,
} from "@/lib/scaleTakeHistory";
import { buildScaleExerciseMidis } from "@/lib/scales";
import type {
  ScalePracticeNoteRow,
  ScalePracticeSessionV1,
} from "@/lib/scalePracticeTypes";

function note(
  index: number,
  midi: number,
  label: string,
  bucket: ScalePracticeNoteRow["intonationBucket"],
  missing = false,
): ScalePracticeNoteRow {
  return {
    noteIndex: index,
    expectedMidi: midi,
    expectedNoteLabel: label,
    detectedMidi: missing ? 0 : midi,
    detectedNoteLabel: missing ? "—" : label,
    detectedHz: missing ? 0 : 440,
    centsDifference: missing ? 0 : bucket === "in_tune" ? 0 : bucket === "sharp" ? 28 : -24,
    intonationBucket: bucket,
    missingData: missing,
  };
}

function take(
  id: string,
  midis: number[],
  notes: ScalePracticeNoteRow[],
  extra: Partial<ScalePracticeSessionV1> = {},
): ScalePracticeSessionV1 {
  return {
    schemaVersion: 1,
    sessionId: id,
    exerciseType: "scale_practice",
    recordedAt: "2026-01-01T00:00:00.000Z",
    scaleId: extra.scaleId ?? "C_major",
    scaleLabel: extra.scaleLabel ?? "C major",
    scaleKind: extra.scaleKind ?? "major",
    tonicPitchClass: extra.tonicPitchClass ?? 0,
    octaveSpan: extra.octaveSpan ?? 1,
    octaveRangeLabel: "C4 → C5",
    rootMidi: extra.rootMidi ?? 60,
    expectedNotesMidi: midis,
    audioSourceType: "recorded",
    sampleRateHz: 48000,
    notes,
    summary: {
      overallScore0to100: 50,
      averageAbsCents: 20,
      inTunePercent: 50,
      weakestNoteIndices: [],
      trend: "balanced",
      meanSignedCents: 0,
      notesAnalyzed: notes.filter((n) => !n.missingData).length,
      notesMissing: notes.filter((n) => n.missingData).length,
    },
    ...extra,
  };
}

describe("exerciseConfigKey", () => {
  it("keeps octave, direction, and mode on separate keys", () => {
    const cMaj1Up = buildScaleExerciseMidis(60, "major", 1, "ascending");
    const cMaj1Rt = buildScaleExerciseMidis(60, "major", 1, "up_down");
    const cMaj2Rt = buildScaleExerciseMidis(60, "major", 2, "up_down");
    const cMin1Rt = buildScaleExerciseMidis(60, "natural_minor", 1, "up_down");

    const a = { scaleId: "C_major", octaveSpan: 1 as const, scaleKind: "major" as const, expectedNotesMidi: cMaj1Up };
    const b = { scaleId: "C_major", octaveSpan: 1 as const, scaleKind: "major" as const, expectedNotesMidi: cMaj1Rt };
    const c = { scaleId: "C_major", octaveSpan: 2 as const, scaleKind: "major" as const, expectedNotesMidi: cMaj2Rt };
    const d = { scaleId: "C_natural_minor", octaveSpan: 1 as const, scaleKind: "natural_minor" as const, expectedNotesMidi: cMin1Rt };

    expect(inferExerciseMotion(a)).toBe("ascending");
    expect(inferExerciseMotion(b)).toBe("up_down");
    expect(exerciseConfigKey(a)).not.toBe(exerciseConfigKey(b));
    expect(exerciseConfigKey(b)).not.toBe(exerciseConfigKey(c));
    expect(exerciseConfigKey(b)).not.toBe(exerciseConfigKey(d));
    expect(sameScaleExercise(a, b)).toBe(false);
  });
});

describe("filterAttemptsForExercise", () => {
  it("drops takes from another octave or direction", () => {
    const up = buildScaleExerciseMidis(60, "major", 1, "ascending");
    const round = buildScaleExerciseMidis(60, "major", 1, "up_down");
    const twoOct = buildScaleExerciseMidis(60, "major", 2, "up_down");
    const keep = take("a", round, [note(0, 60, "C4", "in_tune")]);
    const otherDir = take("b", up, [note(0, 60, "C4", "in_tune")]);
    const otherOct = take("c", twoOct, [note(0, 60, "C4", "in_tune")], {
      octaveSpan: 2,
    });
    expect(filterAttemptsForExercise([keep, otherDir, otherOct], keep)).toEqual([
      keep,
    ]);
  });
});

describe("appendAttemptForExercise", () => {
  it("starts a new loop when the exercise changes", () => {
    const up = buildScaleExerciseMidis(60, "major", 1, "ascending");
    const round = buildScaleExerciseMidis(60, "major", 1, "up_down");
    const first = take("a", up, [note(0, 60, "C4", "in_tune")]);
    const next = take("b", round, [note(0, 60, "C4", "in_tune")]);
    expect(appendAttemptForExercise([first], next).map((s) => s.sessionId)).toEqual([
      "b",
    ]);
  });
});

describe("compareTakeNotes", () => {
  it("reports improved, still-open, and new issues against the previous take", () => {
    const midis = [62, 67, 69];
    const older = take("t10", midis, [
      note(0, 62, "D4", "sharp"),
      note(1, 67, "G4", "flat"),
      note(2, 69, "A4", "in_tune"),
    ]);
    const newer = take("t11", midis, [
      note(0, 62, "D4", "in_tune"),
      note(1, 67, "G4", "flat"),
      note(2, 69, "A4", "sharp"),
    ]);
    const changes = compareTakeNotes(newer, older);
    expect(changes.map((c) => [c.kind, c.line])).toEqual([
      ["still_needs_work", "G is still too low"],
      ["new_issue", "A is too high"],
      ["improved", "D is now in tune"],
    ]);
  });

  it("does not keep an older issue that the latest take resolved", () => {
    const midis = [62];
    const older = take("old", midis, [note(0, 62, "D4", "sharp")]);
    const newer = take("new", midis, [note(0, 62, "D4", "in_tune")]);
    expect(countUnresolvedNotes(newer)).toBe(0);
    expect(compareTakeNotes(newer, older)).toEqual([
      expect.objectContaining({ kind: "improved", line: "D is now in tune" }),
    ]);
  });

  it("does not compare takes from different exercises", () => {
    const up = buildScaleExerciseMidis(60, "major", 1, "ascending");
    const round = buildScaleExerciseMidis(60, "major", 1, "up_down");
    const a = take("a", up, [note(0, 60, "C4", "sharp")]);
    const b = take("b", round, [note(0, 60, "C4", "sharp")]);
    expect(compareTakeNotes(b, a)).toEqual([]);
  });
});

describe("buildTakeSummaries", () => {
  it("numbers takes and marks improvement vs the previous take", () => {
    const midis = [60, 62];
    const a = take("a", midis, [
      note(0, 60, "C4", "sharp"),
      note(1, 62, "D4", "flat"),
    ]);
    const b = take("b", midis, [
      note(0, 60, "C4", "in_tune"),
      note(1, 62, "D4", "flat"),
    ]);
    expect(buildTakeSummaries([a, b])).toEqual([
      {
        sessionId: "a",
        takeNumber: 1,
        unresolvedCount: 2,
        improved: null,
        isLatest: false,
      },
      {
        sessionId: "b",
        takeNumber: 2,
        unresolvedCount: 1,
        improved: true,
        isLatest: true,
      },
    ]);
  });
});
