import { describe, expect, it } from "vitest";
import { TempoAnalyzer } from "@/features/piece-studio/feedback/analyzers/TempoAnalyzer";
import type { PieceExpectedNote } from "@/features/piece-studio/score/expectedNotes";
import { emptyMusaiScore } from "@/features/piece-studio/score/musaiScore";

function notes(count: number): PieceExpectedNote[] {
  return Array.from({ length: count }, (_, noteIndex) => ({
    midi: 60,
    label: "C4",
    onsetQuarters: noteIndex,
    absoluteOnsetQuarters: noteIndex,
    durationQuarters: 1,
    measure: String(Math.floor(noteIndex / 4) + 1),
    beat: (noteIndex % 4) + 1,
    noteIndex,
    writtenDynamic: null,
  }));
}

function scoreWithTempo(bpm: number) {
  return { ...emptyMusaiScore("Tempo"), tempoBpm: bpm };
}

describe("TempoAnalyzer", () => {
  it("stays not ready without enough heard attacks", () => {
    expect(
      TempoAnalyzer.analyze({
        pieceId: "p",
        attemptId: "a",
        score: null,
        expectedNotes: notes(4),
        pitchMatch: {
          slots: [1, 1, null, null],
          timesSec: [0, 0.5, null, null],
          attackSec: [0, 0.5, null, null],
          durationSec: 1,
        },
      }).status,
    ).toBe("not_ready");
  });

  it("flags a take that rushes against the written tempo", () => {
    const expected = notes(10);
    // Written quarters at 60 bpm are 1s apart; attacks every 0.7s are rushing.
    const attacks = expected.map((_, i) => i * 0.7);
    const report = TempoAnalyzer.analyze({
      pieceId: "p",
      attemptId: "a",
      score: scoreWithTempo(60),
      expectedNotes: expected,
      pitchMatch: {
        slots: expected.map(() => 1),
        timesSec: attacks,
        attackSec: attacks,
        durationSec: 8,
      },
    });
    expect(report.status).toBe("ready");
    expect(report.events).toHaveLength(1);
    expect(report.events[0]?.category).toBe("tempo");
    expect(report.events[0]?.kind).toBe("rushing");
    expect(report.events[0]?.noteIndex).toBeNull();
    expect(report.events[0]?.explanation).not.toMatch(/cent/i);
  });

  it("stays not ready when the take sits near the written tempo", () => {
    const expected = notes(10);
    const attacks = expected.map((_, i) => i * 1);
    const report = TempoAnalyzer.analyze({
      pieceId: "p",
      attemptId: "a",
      score: scoreWithTempo(60),
      expectedNotes: expected,
      pitchMatch: {
        slots: expected.map(() => 1),
        timesSec: attacks,
        attackSec: attacks,
        durationSec: 10,
      },
    });
    expect(report).toEqual({ category: "tempo", status: "not_ready", events: [] });
  });
});
