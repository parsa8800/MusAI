import { describe, expect, it } from "vitest";
import { dynamicLetterMarksFromIssues } from "@/features/piece-studio/feedback/visual/pieceDynamicsScoreMap";
import { applyDynamicLetterTints } from "@/features/piece-studio/score/dynamicLetterTint";
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
          category: "dynamics",
          kind: "too_loud",
          noteIndex: 0,
        },
      ],
    );
    expect(marks).toEqual([{ regionIndex: 0, kind: "too_loud" }]);

    const wrap = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const label of ["p", "f", "ff"]) {
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("class", "vf-dynamic");
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.textContent = label;
      group.appendChild(text);
      svg.appendChild(group);
    }
    wrap.appendChild(svg);
    applyDynamicLetterTints(wrap, marks);

    const groups = [...wrap.querySelectorAll(".vf-dynamic")];
    expect(groups[0]?.getAttribute("data-musai-dynamic")).toBe("too_loud");
    expect(groups[0]?.querySelector("text")?.getAttribute("fill")).toBe(
      "var(--musai-dynamic-wrong)",
    );
    expect(groups[1]?.hasAttribute("data-musai-dynamic")).toBe(false);
    expect(groups[2]?.hasAttribute("data-musai-dynamic")).toBe(false);
  });
});