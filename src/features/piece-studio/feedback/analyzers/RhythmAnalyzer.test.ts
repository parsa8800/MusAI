import { describe, expect, it } from "vitest";
import { RhythmAnalyzer } from "@/features/piece-studio/feedback/analyzers/RhythmAnalyzer";
import type { PieceExpectedNote } from "@/features/piece-studio/score/expectedNotes";

function notes(count: number): PieceExpectedNote[] {
  return Array.from({ length: count }, (_, noteIndex) => ({
    midi: 60,
    label: "C4",
    onsetQuarters: noteIndex,
    absoluteOnsetQuarters: noteIndex,
    durationQuarters: 1,
    measure: "1",
    beat: noteIndex + 1,
    noteIndex,
    writtenDynamic: null,
  }));
}

describe("RhythmAnalyzer", () => {
  it("stays not ready when there is no beat to compare", () => {
    expect(
      RhythmAnalyzer.analyze({
        pieceId: "p",
        attemptId: "a",
        score: null,
        expectedNotes: [],
      }),
    ).toEqual({ category: "rhythm", status: "not_ready", events: [] });
    expect(
      RhythmAnalyzer.analyze({
        pieceId: "p",
        attemptId: "a",
        score: null,
        expectedNotes: notes(4),
        pitchMatch: {
          slots: [1, null, null, null],
          timesSec: [0.1, null, null, null],
          attackSec: [0.1, null, null, null],
          durationSec: 1,
        },
      }).status,
    ).toBe("not_ready");
  });

  it("emits a cut-short note and a note held too long", () => {
    const report = RhythmAnalyzer.analyze({
      pieceId: "p",
      attemptId: "a",
      score: null,
      expectedNotes: notes(4),
      pitchMatch: {
        slots: [1, 1, 1, 1],
        timesSec: [0, 1, 1.35, 1.85],
        attackSec: [0, 1, 1.35, 1.85],
        durationSec: 2,
      },
    });
    expect(report.status).toBe("ready");
    expect(report.events.map((event) => [event.noteIndex, event.kind])).toEqual([
      [0, "duration"],
      [2, "duration"],
    ]);
    expect(report.events[0]?.explanation).toBe("Bar 1, beat 1 was held too long.");
    expect(report.events[1]?.explanation).toBe("Bar 1, beat 3 was cut short.");
    expect(report.events[0]?.explanation).not.toMatch(/cent/i);
  });

  it("does not turn a missed note into a rhythm mark", () => {
    const report = RhythmAnalyzer.analyze({
      pieceId: "p",
      attemptId: "a",
      score: null,
      expectedNotes: notes(4),
      pitchMatch: {
        slots: [1, 1, null, 1],
        timesSec: [0, 0.5, null, 1.5],
        attackSec: [0, 0.5, null, 1.5],
        durationSec: 2,
      },
    });
    expect(report.status).toBe("ready");
    expect(report.events).toEqual([]);
  });
});
