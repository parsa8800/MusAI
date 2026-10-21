import { describe, expect, it } from "vitest";
import {
  rhythmHighlightExplanation,
  rhythmHighlightsFromIssues,
  rhythmRunForIssueId,
} from "@/features/piece-studio/feedback/visual/pieceRhythmScoreMap";
import type { PieceCoachIssueView } from "@/features/piece-studio/feedback/visual/pieceCoachIssueView";

function issue(
  partial: Pick<PieceCoachIssueView, "id" | "category" | "kind"> &
    Partial<
      Pick<
        PieceCoachIssueView,
        | "noteIndex"
        | "startWholeNotes"
        | "endWholeNotes"
        | "measure"
        | "beat"
        | "where"
        | "what"
        | "practise"
      >
    >,
): PieceCoachIssueView {
  const measure = partial.measure ?? "1";
  return {
    id: partial.id,
    source: "analysis",
    category: partial.category,
    kind: partial.kind,
    severity: "notice",
    label: `Bar ${measure}`,
    visualTone: partial.category === "pitch" ? "pitch" : "rhythm",
    visualStyle: "note",
    measure,
    beat: partial.beat ?? 1,
    noteIndex: partial.noteIndex ?? 0,
    startWholeNotes: partial.startWholeNotes ?? 0,
    endWholeNotes: partial.endWholeNotes ?? 0.25,
    improveFirst: "Wait for the beat",
    where: partial.where ?? `Bar ${measure}`,
    what: partial.what ?? "Arrived a little early",
    practise: partial.practise ?? "Tap the beat, then play just this bar.",
    coach: "Bar 1 started a little early.",
  };
}

describe("rhythmHighlightsFromIssues", () => {
  it("paints a staff rectangle on every rhythm note and leaves pitch colours alone", () => {
    const highlights = rhythmHighlightsFromIssues(
      [
        issue({ id: "pitch-0", category: "pitch", kind: "sharp" }),
        issue({ id: "rhythm-1", category: "rhythm", kind: "early", noteIndex: 0, startWholeNotes: 0, endWholeNotes: 0.25 }),
        issue({ id: "rhythm-2", category: "rhythm", kind: "duration", noteIndex: 8, startWholeNotes: 2, endWholeNotes: 2.25 }),
      ],
      "rhythm-2",
    );
    expect(highlights.map((item) => item.id)).toEqual(["rhythm-1", "rhythm-2"]);
    expect(highlights.every((item) => item.visualTone === "rhythm")).toBe(true);
    expect(highlights.every((item) => item.visualStyle === "heat")).toBe(true);
    expect(highlights.find((item) => item.id === "rhythm-2")?.emphasis).toBe(
      "focus",
    );
    expect(highlights.find((item) => item.id === "rhythm-1")?.emphasis).toBe(
      "related",
    );
  });

  it("covers neighbouring rhythm notes with one rectangle", () => {
    const highlights = rhythmHighlightsFromIssues(
      [
        issue({
          id: "rhythm-a",
          category: "rhythm",
          kind: "early",
          noteIndex: 4,
          startWholeNotes: 1,
          endWholeNotes: 1.25,
        }),
        issue({
          id: "rhythm-b",
          category: "rhythm",
          kind: "late",
          noteIndex: 5,
          startWholeNotes: 1.25,
          endWholeNotes: 1.5,
        }),
        issue({
          id: "rhythm-c",
          category: "rhythm",
          kind: "duration",
          noteIndex: 12,
          startWholeNotes: 3,
          endWholeNotes: 3.25,
        }),
      ],
      "rhythm-b",
    );
    expect(highlights).toHaveLength(2);
    expect(highlights[0]).toMatchObject({
      id: "rhythm-b",
      startWholeNotes: 1,
      endWholeNotes: 1.5,
      emphasis: "focus",
    });
    expect(highlights[1]).toMatchObject({
      id: "rhythm-c",
      startWholeNotes: 3,
      endWholeNotes: 3.25,
      emphasis: "related",
    });
  });
});

describe("rhythmHighlightExplanation", () => {
  const stretch = [
    issue({
      id: "rhythm-a",
      category: "rhythm",
      kind: "early",
      noteIndex: 4,
      startWholeNotes: 1,
      endWholeNotes: 1.25,
      beat: 1,
      what: "Arrived a little early",
      practise: "Wait for the beat.",
    }),
    issue({
      id: "rhythm-b",
      category: "rhythm",
      kind: "late",
      noteIndex: 5,
      startWholeNotes: 1.25,
      endWholeNotes: 1.5,
      measure: "2",
      beat: 1,
      what: "Arrived a little late",
      practise: "Wait for the beat.",
    }),
    issue({
      id: "rhythm-c",
      category: "rhythm",
      kind: "duration",
      noteIndex: 12,
      startWholeNotes: 3,
      endWholeNotes: 3.25,
      what: "Held a little too short",
      practise: "Hold it for the full beat.",
    }),
  ];

  it("explains the tapped rectangle in one sentence", () => {
    const run = rhythmRunForIssueId(stretch, "rhythm-b");
    expect(run?.map((item) => item.id)).toEqual(["rhythm-a", "rhythm-b"]);
    expect(
      rhythmHighlightExplanation(
        run!,
        new Map([
          [4, { label: "G4", durationQuarters: 1, absoluteOnsetQuarters: 4 }],
          [5, { label: "G4", durationQuarters: 1, absoluteOnsetQuarters: 5 }],
        ]),
      ),
    ).toEqual({
      place: "Bar 1 to 2",
      line: "Start the crotchets with the beat",
    });
  });

  it("names the notes and their written length", () => {
    const run = [
      issue({
        id: "rhythm-g",
        category: "rhythm",
        kind: "duration",
        noteIndex: 1,
        beat: 2,
        startWholeNotes: 0.25,
        endWholeNotes: 0.5,
        what: "Held a little too short",
        practise: "Hold it for the full beat.",
      }),
    ];
    expect(
      rhythmHighlightExplanation(
        run,
        new Map([
          [1, { label: "E4", durationQuarters: 1, absoluteOnsetQuarters: 1 }],
          [2, { label: "F#4", durationQuarters: 1, absoluteOnsetQuarters: 2 }],
        ]),
      ),
    ).toEqual({
      place: "Bar 1",
      bullets: [
        "The E and F# crotchets were cut short",
        "Hold each crotchet for a full beat",
      ],
    });
  });

  it("asks for quaver time when the stretch was held long", () => {
    const run = [
      issue({
        id: "rhythm-a",
        category: "rhythm",
        kind: "duration",
        noteIndex: 4,
        startWholeNotes: 1,
        endWholeNotes: 1.125,
        what: "Held a little too long",
        practise: "Let the next note come in sooner.",
      }),
      issue({
        id: "rhythm-b",
        category: "rhythm",
        kind: "duration",
        noteIndex: 5,
        startWholeNotes: 1.125,
        endWholeNotes: 1.25,
        what: "Held a little too long",
        practise: "Let the next note come in sooner.",
      }),
    ];
    expect(
      rhythmHighlightExplanation(
        run,
        new Map([
          [4, { label: "G4", durationQuarters: 0.5, absoluteOnsetQuarters: 4 }],
          [5, { label: "F#4", durationQuarters: 0.5, absoluteOnsetQuarters: 4.5 }],
        ]),
      ),
    ).toEqual({
      place: "Bar 1",
      bullets: [
        "The G and F# quavers ran long",
        "Give each quaver half a beat",
      ],
    });
  });

  it("names every quaver in the rectangle, including two of the same pitch", () => {
    const run = [
      issue({
        id: "rhythm-d",
        category: "rhythm",
        kind: "duration",
        noteIndex: 21,
        measure: "7",
        startWholeNotes: 6,
        endWholeNotes: 6.25,
        what: "Held a little too long",
        practise: "Let the next note come in sooner.",
      }),
    ];
    expect(
      rhythmHighlightExplanation(
        run,
        new Map([
          [20, { label: "D5", durationQuarters: 0.5, absoluteOnsetQuarters: 24 }],
          [21, { label: "D5", durationQuarters: 0.5, absoluteOnsetQuarters: 24.5 }],
        ]),
      ),
    ).toEqual({
      place: "Bar 7",
      bullets: ["Both D quavers ran long", "Give each quaver half a beat"],
    });
  });

  it("does not explain a pitch note as a rhythm stretch", () => {
    expect(
      rhythmRunForIssueId(
        [issue({ id: "pitch-0", category: "pitch", kind: "sharp" })],
        "pitch-0",
      ),
    ).toBeNull();
  });
});
