import { describe, expect, it } from "vitest";
import { dynamicHighlightExplanation, dynamicLetterMarksFromIssues } from "@/features/piece-studio/feedback/visual/pieceDynamicsScoreMap";
import {
  applyDynamicLetterTints,
  pressBoxesForMarks,
} from "@/features/piece-studio/score/dynamicLetterTint";
import type { PieceExpectedNote } from "@/features/piece-studio/score/expectedNotes";

function note(index: number, dynamic: string | null): PieceExpectedNote {
  return {
    midi: 60,
    label: "C4",
    onsetQuarters: 0,
    absoluteOnsetQuarters: index,
    durationQuarters: 1,
    measure: "1",
    beat: 1,
    noteIndex: index,
    writtenDynamic: dynamic,
  };
}

describe("dynamic letter colour", () => {
  it("colours only the written dynamic that was wrong", () => {
    const marks = dynamicLetterMarksFromIssues(
      [note(0, "p"), note(1, "p"), note(2, "f"), note(3, "ff")],
      [
        {
          id: "dynamics-0-too_loud",
          category: "dynamics",
          kind: "too_loud",
          noteIndex: 0,
        },
      ],
    );
    expect(marks).toEqual([
      {
        regionIndex: 0,
        kind: "too_loud",
        issueId: "dynamics-0-too_loud",
      },
    ]);

    const wrap = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [index, label] of ["p", "f", "ff"].entries()) {
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.textContent = label;
      text.setAttribute("data-musai-dynamic-index", String(index));
      svg.appendChild(text);
    }
    wrap.appendChild(svg);
    applyDynamicLetterTints(wrap, marks);

    const letters = [...wrap.querySelectorAll("text")];
    expect(letters[0]?.getAttribute("data-musai-dynamic")).toBe("wrong");
    expect(letters[0]?.getAttribute("data-musai-dynamic-issue")).toBe(
      "dynamics-0-too_loud",
    );
    expect(letters[0]?.getAttribute("fill")).toBe("var(--musai-danger)");
    expect(letters[1]?.hasAttribute("data-musai-dynamic")).toBe(false);
    expect(letters[2]?.hasAttribute("data-musai-dynamic")).toBe(false);

    applyDynamicLetterTints(wrap, []);
    expect(letters[0]?.hasAttribute("data-musai-dynamic")).toBe(false);
    expect(letters[0]?.getAttribute("fill")).toBeNull();
    expect(letters[0]?.style.fill).toBe("");
  });

  it("gives a hairpin one press target and a split wedge one per system", () => {
    const boxes = pressBoxesForMarks([
      { issueId: "dynamics-hairpin-31-unchanged", x: 40, y: 80, width: 90, height: 4 },
      { issueId: "dynamics-hairpin-31-unchanged", x: 130, y: 82, width: 70, height: 3 },
      { issueId: "dynamics-hairpin-31-unchanged", x: 20, y: 240, width: 80, height: 4 },
      { issueId: "dynamics-0-too_loud", x: 12, y: 70, width: 14, height: 18 },
    ]);
    const hairpin = boxes.filter(
      (box) => box.issueId === "dynamics-hairpin-31-unchanged",
    );
    const letter = boxes.find((box) => box.issueId === "dynamics-0-too_loud");
    expect(hairpin).toHaveLength(2);
    expect(hairpin[0]?.width).toBeGreaterThan(150);
    expect(hairpin[1]?.y).toBeGreaterThan(200);
    expect(letter?.width).toBeGreaterThanOrEqual(44);
    expect(letter?.height).toBeGreaterThanOrEqual(36);
  });

  it("opens two short lines for a red mark", () => {
    expect(
      dynamicHighlightExplanation({
        where: "Bar 1 · beat 1",
        what: "This p was louder than the rest of your playing.",
        practise: "Follow the marked p.",
      }),
    ).toEqual({
      place: "Bar 1",
      bullets: [
        "This p was louder than the rest of your playing",
        "Follow the marked p",
      ],
    });
  });
});