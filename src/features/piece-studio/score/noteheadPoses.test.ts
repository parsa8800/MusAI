import { describe, expect, it } from "vitest";
import {
  collectNoteheadPosesFromDom,
  sortNoteheadsInReadingOrder,
} from "@/features/piece-studio/score/noteheadPoses";

describe("collectNoteheadPosesFromDom", () => {
  it("sorts a high ledger note by x on its staff, not as a previous system", () => {
    const bands = [{ y: 40, height: 44, x: 20, width: 400 }];
    const poses = sortNoteheadsInReadingOrder(
      [
        { x: 100, y: 50, height: 12, width: 10 },
        { x: 140, y: -28, height: 12, width: 10 },
        { x: 180, y: 58, height: 12, width: 10 },
      ],
      bands,
    );
    expect(poses.map((p) => p.x)).toEqual([100, 140, 180]);
  });

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
    expect(poses.every((p) => p.width === 10)).toBe(true);
    expect(poses.every((p) => p.height === 12)).toBe(true);
    wrap.remove();
  });

  it("keeps a high ledger note in left-to-right order on its staff", () => {
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

    function addHead(x: number, y: number) {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "vf-notehead");
      g.getBoundingClientRect = () =>
        ({
          left: x,
          top: y,
          right: x + 10,
          bottom: y + 12,
          width: 10,
          height: 12,
          x,
          y,
          toJSON: () => ({}),
        }) as DOMRect;
      svg.appendChild(g);
    }

    addHead(100, 50);
    addHead(140, -20); // high ledger — used to sort as a previous system
    addHead(180, 50);

    const graceGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    graceGroup.setAttribute("class", "vf-gracenotes");
    const grace = document.createElementNS("http://www.w3.org/2000/svg", "g");
    grace.setAttribute("class", "vf-notehead");
    grace.getBoundingClientRect = () =>
      ({
        left: 128,
        top: 42,
        right: 136,
        bottom: 50,
        width: 8,
        height: 8,
        x: 128,
        y: 42,
        toJSON: () => ({}),
      }) as DOMRect;
    graceGroup.appendChild(grace);
    svg.appendChild(graceGroup);

    host.appendChild(svg);
    wrap.appendChild(host);
    document.body.appendChild(wrap);

    const poses = collectNoteheadPosesFromDom(wrap);
    expect(poses.map((p) => Math.round(p.x))).toEqual([105, 145, 185]);
    wrap.remove();
  });

  it("skips rest glyphs that OSMD marks as noteheads", () => {
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

    function add(x: number, width: number, height: number) {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "vf-notehead");
      g.getBoundingClientRect = () =>
        ({
          left: x,
          top: 40,
          right: x + width,
          bottom: 40 + height,
          width,
          height,
          x,
          y: 40,
          toJSON: () => ({}),
        }) as DOMRect;
      svg.appendChild(g);
    }

    add(40, 13, 11);
    add(80, 9, 31);
    add(120, 13, 11);
    host.appendChild(svg);
    wrap.appendChild(host);
    document.body.appendChild(wrap);

    const poses = collectNoteheadPosesFromDom(wrap);
    expect(poses.map((p) => Math.round(p.x))).toEqual([47, 127]);
    wrap.remove();
  });

  it("skips half rests so later notes keep their place", () => {
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

    function add(x: number, width: number, height: number) {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "vf-notehead");
      g.getBoundingClientRect = () =>
        ({
          left: x,
          top: 40,
          right: x + width,
          bottom: 40 + height,
          width,
          height,
          x,
          y: 40,
          toJSON: () => ({}),
        }) as DOMRect;
      svg.appendChild(g);
    }

    add(40, 13, 11);
    add(80, 20, 7);
    add(120, 13, 11);
    host.appendChild(svg);
    wrap.appendChild(host);
    document.body.appendChild(wrap);

    const poses = collectNoteheadPosesFromDom(wrap);
    expect(poses.map((p) => Math.round(p.x))).toEqual([47, 127]);
    wrap.remove();
  });
});
