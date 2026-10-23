import { describe, expect, it } from "vitest";
import { tagEngravedDynamics } from "@/features/piece-studio/score/tagEngravedDynamics";

function text(label: string): SVGTextElement {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "text");
  node.textContent = label;
  return node;
}

function line(): SVGLineElement {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "line");
  const host = document.createElementNS("http://www.w3.org/2000/svg", "g");
  host.appendChild(node);
  return node;
}

describe("tagEngravedDynamics", () => {
  it("numbers letters and hairpins in score order, including a split wedge", () => {
    const piano = text("p");
    const wedge = {};
    const first = line();
    const second = line();
    const loud = text("ff");
    const verbal = text("cresc.");

    tagEngravedDynamics({
      GraphicSheet: {
        MusicPages: [
          {
            MusicSystems: [
              {
                StaffLines: [
                  {
                    AbstractExpressions: [
                      { Expression: "p", Label: { SVGNode: piano } },
                      {
                        ContinuousDynamic: wedge,
                        Lines: [{ SVGElement: first }],
                      },
                      {
                        ContinuousDynamic: wedge,
                        IsSplittedPart: true,
                        Lines: [{ SVGElement: second }],
                      },
                      {
                        ContinuousDynamic: { id: "word" },
                        IsVerbal: true,
                        Label: { SVGNode: verbal },
                      },
                      { Expression: "ff", Label: { SVGNode: loud } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(piano.getAttribute("data-musai-dynamic-index")).toBe("0");
    expect(first.getAttribute("data-musai-dynamic-index")).toBe("1");
    expect(second.getAttribute("data-musai-dynamic-index")).toBe("1");
    expect(first.parentNode?.querySelector("[data-musai-dynamic-hit]")?.getAttribute(
      "data-musai-dynamic-index",
    )).toBe("1");
    expect(verbal.getAttribute("data-musai-dynamic-index")).toBe("2");
    expect(loud.getAttribute("data-musai-dynamic-index")).toBe("3");
  });
});
