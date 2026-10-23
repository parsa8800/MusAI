import { describe, expect, it } from "vitest";
import { PitchAnalyzer } from "@/features/piece-studio/feedback/analyzers/PitchAnalyzer";
import type { PieceExpectedNote } from "@/features/piece-studio/score/expectedNotes";
import { midiToHz } from "@/lib/intonation";

function notes(midis: readonly number[]): PieceExpectedNote[] {
  return midis.map((midi, noteIndex) => ({
    midi,
    label: `N${noteIndex}`,
    onsetQuarters: noteIndex,
    absoluteOnsetQuarters: noteIndex,
    durationQuarters: 1,
    measure: "1",
    beat: noteIndex + 1,
    noteIndex,
    writtenDynamic: null,
  }));
}

describe("PitchAnalyzer", () => {
  it("stays not ready without audio or a pitch match", () => {
    expect(
      PitchAnalyzer.analyze({
        pieceId: "p",
        attemptId: "a",
        score: null,
        expectedNotes: notes([60]),
      }),
    ).toEqual({ category: "pitch", status: "not_ready", events: [] });
  });

  it("emits sharp, flat, and missed from a shared pitch match", () => {
    const expected = notes([60, 62, 64]);
    const report = PitchAnalyzer.analyze({
      pieceId: "p",
      attemptId: "a",
      score: null,
      expectedNotes: expected,
      pitchMatch: {
        slots: [
          midiToHz(60) * 2 ** (50 / 1200),
          midiToHz(62) * 2 ** (-50 / 1200),
          null,
        ],
        timesSec: [0.1, 0.5, null],
        attackSec: [0.1, 0.5, null],
        durationSec: 2,
      },
    });
    expect(report.status).toBe("ready");
    expect(report.events.map((event) => [event.noteIndex, event.kind])).toEqual([
      [0, "sharp"],
      [1, "flat"],
      [2, "missed"],
    ]);
    expect(report.events.every((event) => event.category === "pitch")).toBe(true);
    expect(report.events.some((event) => event.kind === "unstable")).toBe(false);
    expect(report.events[0]?.explanation).toMatch(/bar 1/i);
    expect(report.events[0]?.explanation).not.toMatch(/cent/i);
    expect(report.events[2]?.recordingTimeSec).toBeNull();
  });

  it("stays quiet when every heard note sits in tune", () => {
    const expected = notes([60, 62]);
    const report = PitchAnalyzer.analyze({
      pieceId: "p",
      attemptId: "a",
      score: null,
      expectedNotes: expected,
      pitchMatch: {
        slots: [midiToHz(60), midiToHz(62)],
        timesSec: [0, 0.5],
        attackSec: [0, 0.5],
        durationSec: 1,
      },
    });
    expect(report.status).toBe("ready");
    expect(report.events).toEqual([]);
  });
});
