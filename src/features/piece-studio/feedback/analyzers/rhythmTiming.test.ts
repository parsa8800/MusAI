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

  it("marks a rushed join as the note left short, not also the next note", () => {
    // Beat sits near 0.5s. Note 0 is held for 1.0s.
    // Note 1 is left early, so note 2 arrives ~0.15s early.
    const findings = findRhythmFindings(quarters([0, 1, 1.25, 1.75]));
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
    ]);
    expect(findings?.some((finding) => finding.kind === "early")).toBe(false);
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
    const findings = findRhythmFindings(quarters([0, 0.5, 1.28, 1.78]));
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
    ]);
  });

  it("marks a note that is cut far too short without a second early mark", () => {
    const findings = findRhythmFindings(quarters([0, 0.2, 0.7, 1.2]));
    expect(findings).toEqual([
      expect.objectContaining({
        noteIndex: 0,
        kind: "duration",
        length: "short",
      }),
    ]);
  });

  it("does not mark a rest unless the gap is extreme", () => {
    const afterRest = findRhythmFindings([
      { noteIndex: 0, absoluteOnsetQuarters: 0, durationQuarters: 1, heardSec: 0 },
      { noteIndex: 1, absoluteOnsetQuarters: 4, durationQuarters: 1, heardSec: 2.2 },
      { noteIndex: 2, absoluteOnsetQuarters: 5, durationQuarters: 1, heardSec: 2.7 },
    ]);
    expect(afterRest).toEqual([]);
  });

  it("does not mark the next bar's even quavers after two short crotchets", () => {
    const findings = findRhythmFindings([
      { noteIndex: 6, absoluteOnsetQuarters: 6, durationQuarters: 1, measure: "2", heardSec: 3.0 },
      { noteIndex: 7, absoluteOnsetQuarters: 7, durationQuarters: 1, measure: "2", heardSec: 3.2 },
      { noteIndex: 8, absoluteOnsetQuarters: 8, durationQuarters: 0.5, measure: "3", heardSec: 4.0 },
      { noteIndex: 9, absoluteOnsetQuarters: 8.5, durationQuarters: 0.5, measure: "3", heardSec: 4.25 },
      { noteIndex: 10, absoluteOnsetQuarters: 9, durationQuarters: 0.5, measure: "3", heardSec: 4.5 },
      { noteIndex: 11, absoluteOnsetQuarters: 9.5, durationQuarters: 0.5, measure: "3", heardSec: 4.75 },
    ]);
    expect(findings?.some((finding) => finding.noteIndex === 8 || finding.noteIndex === 9)).toBe(
      false,
    );
    expect(findings?.some((finding) => finding.noteIndex === 6 && finding.length === "short")).toBe(
      true,
    );
  });

  it("cannot judge rhythm from a single heard note", () => {
    expect(findRhythmFindings(quarters([0.2, null, null]))).toBeNull();
  });
});
