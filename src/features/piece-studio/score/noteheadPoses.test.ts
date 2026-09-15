import { describe, expect, it } from "vitest";
import { collectNoteheadPosesFromDom } from "@/features/piece-studio/score/noteheadPoses";

describe("collectNoteheadPosesFromDom", () => {
  it("reads noteheads left-to-right and dedupes chords", () => {
    const wrap = document.createElement("div");
    wrap.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 400,
        bottom: 200,
        width: 400,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    Object.defineProperty(wrap, "scrollLeft", { value: 0 });
    Object.defineProperty(wrap, "scrollTop", { value: 0 });

    const host = document.createElement("div");
    host.className = "musai-piece-osmd";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const xs = [40, 80, 80, 120, 160];
    for (const x of xs) {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "vf-notehead");
      g.getBoundingClientRect = () =>
        ({
          left: x,
          top: 50,
          right: x + 10,
          bottom: 62,
          width: 10,
          height: 12,
          x,
          y: 50,
          toJSON: () => ({}),
        }) as DOMRect;
      svg.appendChild(g);
    }
    host.appendChild(svg);
    wrap.appendChild(host);
    document.body.appendChild(wrap);

    const poses = collectNoteheadPosesFromDom(wrap);
    expect(poses).toHaveLength(4);
    expect(poses.map((p) => p.x)).toEqual([45, 85, 125, 165]);
    wrap.remove();
  });
});
