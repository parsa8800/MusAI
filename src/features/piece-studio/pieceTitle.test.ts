import { describe, expect, it } from "vitest";
import {
  isMachinePieceTitle,
  recommendedPieceTitle,
  titlesDetectedInMusicXml,
} from "@/features/piece-studio/pieceTitle";

const UUID = "4a143147 0dd7 45ff 986e B4223ecaa741";

describe("piece titles", () => {
  it("treats a file id as not a piece name", () => {
    expect(isMachinePieceTitle(UUID)).toBe(true);
    expect(isMachinePieceTitle("4a143147-0dd7-45ff-986e-b4223ecaa741")).toBe(true);
    expect(isMachinePieceTitle("Untitled piece")).toBe(true);
    expect(isMachinePieceTitle("Twinkle")).toBe(false);
  });

  it("reads a work title from the score", () => {
    const xml = "<score-partwise><work><work-title>Canon in D</work-title></work></score-partwise>";
    expect(titlesDetectedInMusicXml(xml)).toEqual(["Canon in D"]);
    expect(
      recommendedPieceTitle({
        fileName: "4a143147-0dd7-45ff-986e-b4223ecaa741.musicxml",
        scoreTitle: UUID,
        musicXml: xml,
      }),
    ).toBe("Canon in D");
  });

  it("uses a title credit when the work title is missing", () => {
    const xml = `
      <score-partwise>
        <credit><credit-type>title</credit-type><credit-words>Violin Concerto</credit-words></credit>
        <credit><credit-type>composer</credit-type><credit-words>Mendelssohn</credit-words></credit>
      </score-partwise>`;
    expect(recommendedPieceTitle({ fileName: `${UUID}.pdf`, musicXml: xml })).toBe(
      "Violin Concerto",
    );
  });

  it("suggests a readable filename and skips a file id", () => {
    expect(
      recommendedPieceTitle({ fileName: "Evening piece.musicxml", scoreTitle: UUID }),
    ).toBe("Evening piece");
    expect(
      recommendedPieceTitle({
        fileName: "4a143147-0dd7-45ff-986e-b4223ecaa741.pdf",
        scoreTitle: UUID,
      }),
    ).toBeNull();
  });
});
