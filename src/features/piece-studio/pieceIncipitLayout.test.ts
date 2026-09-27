import { describe, expect, it } from "vitest";
import { emptyMusaiScore } from "@/features/piece-studio/score/musaiScore";
import {
  keySignatureFifths,
  layoutPieceIncipit,
  learnedNoteCount,
  openingEventsFromScore,
  parseTimeSignature,
  staffStepFromTop,
} from "@/features/piece-studio/pieceIncipitLayout";

describe("piece library incipit", () => {
  it("reads the written key", () => {
    expect(keySignatureFifths("E minor")).toBe(1);
    expect(keySignatureFifths("D major")).toBe(2);
    expect(keySignatureFifths("A minor")).toBe(0);
    expect(keySignatureFifths("B♭ major")).toBe(-2);
    expect(keySignatureFifths("F# minor")).toBe(3);
    expect(keySignatureFifths(null)).toBe(0);
  });

  it("uses the written opening, not a stand-in phrase", () => {
    const score = emptyMusaiScore("Twinkle");
    score.parts = [
      {
        id: "p1",
        name: null,
        measures: [
          {
            number: "1",
            divisions: 1,
            key: null,
            time: null,
            tempoBpm: null,
            clef: "treble",
            events: [
              {
                kind: "note",
                onsetQuarters: 0,
                durationQuarters: 1,
                pitch: { step: "C", alter: 0, octave: 5, midi: 72 },
                type: "quarter",
                dots: 0,
                accidental: null,
                chord: false,
                tied: false,
                articulations: [],
                staff: 1,
                voice: 1,
              },
              {
                kind: "note",
                onsetQuarters: 1,
                durationQuarters: 1,
                pitch: { step: "G", alter: 0, octave: 4, midi: 67 },
                type: "quarter",
                dots: 0,
                accidental: null,
                chord: false,
                tied: false,
                articulations: [],
                staff: 1,
                voice: 1,
              },
            ],
          },
        ],
      },
    ];
    const events = openingEventsFromScore(score, "treble");
    expect(events.map((event) => event.step)).toEqual([
      staffStepFromTop("C", 5, "treble"),
      staffStepFromTop("G", 4, "treble"),
    ]);
    expect(events[0]?.step).toBeLessThan(events[1]?.step ?? 0);
  });

  it("lights notes from the left as practice fills in", () => {
    expect(learnedNoteCount(8, 0)).toBe(0);
    expect(learnedNoteCount(8, 82)).toBeGreaterThan(0);
    expect(learnedNoteCount(8, 100)).toBe(8);
    const layout = layoutPieceIncipit({
      events: [
        { kind: "note", step: 2, durationQuarters: 1 },
        { kind: "note", step: 4, durationQuarters: 1 },
        { kind: "note", step: 6, durationQuarters: 1 },
        { kind: "note", step: 8, durationQuarters: 1 },
      ],
      keySignature: "C major",
      timeSignature: "4/4",
      progress: 50,
      clef: "treble",
    });
    expect(parseTimeSignature("4/4")).toEqual([4, 4]);
    expect(layout.time).toMatchObject({ beats: 4, beatType: 4 });
    expect(layout.notes.filter((note) => note.learned).length).toBe(2);
    expect(layout.notes[0]?.learned).toBe(true);
    expect(layout.notes.at(-1)?.learned).toBe(false);
  });

  it("draws one sharp for E minor", () => {
    const layout = layoutPieceIncipit({
      events: [],
      keySignature: "E minor",
      timeSignature: "2/2",
      progress: 0,
      clef: "treble",
    });
    expect(layout.accidentals).toHaveLength(1);
    expect(layout.accidentals[0]?.kind).toBe("sharp");
    expect(layout.notes.every((note) => !note.learned)).toBe(true);
  });
});
