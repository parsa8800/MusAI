import { describe, expect, it } from "vitest";
import {
  findTempoPace,
  tempoExplanation,
} from "@/features/piece-studio/feedback/analyzers/tempoTiming";
import type { RhythmClockNote } from "@/features/piece-studio/feedback/analyzers/rhythmTiming";

function even(secPerQuarter: number, count = 16): RhythmClockNote[] {
  return Array.from({ length: count }, (_, noteIndex) => ({
    noteIndex,
    absoluteOnsetQuarters: noteIndex,
    heardSec: noteIndex * secPerQuarter,
  }));
}

describe("findTempoPace", () => {
  it("leaves a steady take that matches the written beat unmarked", () => {
    expect(findTempoPace(even(0.7), 86)).toBeNull();
  });

  it("leaves an even slower take unmarked when the score has no tempo", () => {
    expect(findTempoPace(even(1.15), null)).toBeNull();
  });

  it("names a take that is slower all the way through", () => {
    const pace = findTempoPace(even(1.15), 86);
    expect(pace).toEqual({ kind: "slowing", shape: "throughout" });
    expect(tempoExplanation(pace!)).toBe(
      "The beat was slower all the way through.",
    );
  });

  it("names a take that starts in time and gets slower", () => {
    const notes: RhythmClockNote[] = [];
    let t = 0;
    for (let i = 0; i < 18; i++) {
      notes.push({
        noteIndex: i,
        absoluteOnsetQuarters: i,
        heardSec: t,
      });
      t += i < 9 ? 0.6 : 0.9;
    }
    expect(findTempoPace(notes, 100)).toEqual({
      kind: "slowing",
      shape: "drift",
    });
  });

  it("does not judge a short fragment as the whole piece", () => {
    expect(findTempoPace(even(1.15, 4), 86)).toBeNull();
  });
});
