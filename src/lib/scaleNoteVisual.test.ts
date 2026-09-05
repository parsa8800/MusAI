import { describe, expect, it } from "vitest";
import { noteVisualTone, shortNoteName } from "@/lib/scaleNoteVisual";
import type { ScalePracticeNoteRow } from "@/lib/scalePracticeTypes";

function row(
  partial: Partial<ScalePracticeNoteRow> &
    Pick<ScalePracticeNoteRow, "centsDifference" | "intonationBucket" | "missingData">,
): ScalePracticeNoteRow {
  return {
    noteIndex: 0,
    expectedMidi: 60,
    expectedNoteLabel: "C4",
    detectedMidi: 60,
    detectedNoteLabel: "C4",
    detectedHz: 261,
    ...partial,
  };
}

describe("scaleNoteVisual", () => {
  it("shortens note labels", () => {
    expect(shortNoteName("C4")).toBe("C");
    expect(shortNoteName("F#5")).toBe("F♯");
  });

  it("uses green / yellow / red by how far off — not sharp vs flat colour", () => {
    expect(
      noteVisualTone(
        row({
          centsDifference: 12,
          intonationBucket: "in_tune",
          missingData: false,
        }),
      ),
    ).toBe("good");
    expect(
      noteVisualTone(
        row({
          centsDifference: 35,
          intonationBucket: "sharp",
          missingData: false,
        }),
      ),
    ).toBe("slight");
    expect(
      noteVisualTone(
        row({
          centsDifference: -35,
          intonationBucket: "flat",
          missingData: false,
        }),
      ),
    ).toBe("slight");
    expect(
      noteVisualTone(
        row({
          centsDifference: 60,
          intonationBucket: "sharp",
          missingData: false,
        }),
      ),
    ).toBe("bad");
    expect(
      noteVisualTone(
        row({
          centsDifference: -60,
          intonationBucket: "flat",
          missingData: false,
        }),
      ),
    ).toBe("bad");
  });
});
