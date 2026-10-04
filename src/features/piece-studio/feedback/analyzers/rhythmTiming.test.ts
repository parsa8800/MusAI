import { describe, expect, it } from "vitest";
import {
  findRhythmFindings,
  type RhythmClockNote,
} from "@/features/piece-studio/feedback/analyzers/rhythmTiming";

function quarters(times: Array<number | null>): RhythmClockNote[] {
  return times.map((heardSec, noteIndex) => ({
    noteIndex,
    absoluteOnsetQuarters: noteIndex,
    heardSec,
  }));
}

describe("findRhythmFindings", () => {
  it("ignores a little wobble around an even beat", () => {
    const findings = findRhythmFindings(quarters([0, 0.54, 0.98, 1.52]));
    expect(findings).toEqual([]);
  });

  it("marks a rushed join as the note left short and the note that arrived early", () => {
    // Beat sits near 0.5s. Note 0 is held for 1.0s.
    // Note 1 is left early, so note 2 arrives ~0.15s early.
    const findings = findRhythmFindings(quarters([0, 1, 1.35, 1.85]));
    expect(findings).toEqual([
      expect.objectContaining({
        noteIndex: 0,
        kind: "duration",
        length: "long",
      }),
      expect.objectContaining({
        noteIndex: 1,
        kind: "duration",
        length: "short",
      }),
      expect.objectContaining({
        noteIndex: 2,
        kind: "early",
        length: null,
      }),
    ]);
  });

  it("does not mark a slower take that stays even", () => {
    const findings = findRhythmFindings(quarters([0, 0.9, 1.8, 2.7]));
    expect(findings).toEqual([]);
  });

  it("does not mark a missed note when the notes around it stay on the beat", () => {
    const findings = findRhythmFindings(quarters([0, 0.5, null, 1.5]));
    expect(findings).toEqual([]);
    expect(findings?.some((finding) => finding.noteIndex === 2)).toBe(false);
  });

  it("marks a moderately late arrival without calling it the wrong length", () => {
    const findings = findRhythmFindings(quarters([0, 0.5, 1.15, 1.65]));
    expect(findings).toEqual([
      expect.objectContaining({ noteIndex: 2, kind: "late" }),
    ]);
  });

  it("marks a repeated pitch that has its own attack and is cut far too short", () => {
    const findings = findRhythmFindings(
      [0, 0.2, 0.7, 1.2].map((heardSec, noteIndex) => ({
        noteIndex,
        absoluteOnsetQuarters: noteIndex,
        heardSec,
        midi: 67,
      })),
    );
    expect(findings).toEqual([
      expect.objectContaining({
        noteIndex: 0,
        kind: "duration",
        length: "short",
      }),
      expect.objectContaining({
        noteIndex: 1,
        kind: "early",
        length: null,
      }),
    ]);
  });

  it("marks a note that is cut far too short and the note that came in early", () => {
    const findings = findRhythmFindings(quarters([0, 0.2, 0.7, 1.2]));
    expect(findings).toEqual([
      expect.objectContaining({
        noteIndex: 0,
        kind: "duration",
        length: "short",
      }),
      expect.objectContaining({
        noteIndex: 1,
        kind: "early",
        length: null,
      }),
    ]);
  });

  it("cannot judge rhythm from a single heard note", () => {
    expect(findRhythmFindings(quarters([0.2, null, null]))).toBeNull();
  });
});
