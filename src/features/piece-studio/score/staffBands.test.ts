import { describe, expect, it } from "vitest";
import {
  collectStaffBandsFromDom,
  horizontalPathSpan,
  staffBandForNoteGroup,
} from "@/features/piece-studio/score/staffBands";

function makeWrap() {
  const wrap = document.createElement("div");
  wrap.className = "musai-piece-osmd-wrap";
  Object.defineProperty(wrap, "scrollTop", { value: 0 });
  Object.defineProperty(wrap, "scrollLeft", { value: 0 });
  Object.defineProperty(wrap, "getBoundingClientRect", {
    value: () => ({ top: 0, left: 0, width: 500, height: 200 }),
  });
  const host = document.createElement("div");
  host.className = "musai-piece-osmd";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  host.appendChild(svg);
  wrap.appendChild(host);
  document.body.appendChild(wrap);
  return { wrap, svg };
}

describe("staffBands", () => {
  it("clusters five horizontal staff lines into one band", () => {
    const { wrap, svg } = makeWrap();
    for (let i = 0; i < 5; i += 1) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", "20");
      line.setAttribute("x2", "420");
      line.setAttribute("y1", String(40 + i * 10));
      line.setAttribute("y2", String(40 + i * 10));
      Object.defineProperty(line, "getBoundingClientRect", {
        value: () => ({
          top: 40 + i * 10,
          left: 20,
          width: 400,
          height: 1,
          bottom: 41 + i * 10,
          right: 420,
        }),
      });
      svg.appendChild(line);
    }

    const bands = collectStaffBandsFromDom(wrap);
    expect(bands.length).toBeGreaterThanOrEqual(1);
    expect(bands[0]?.y).toBeGreaterThanOrEqual(40);
    expect(bands[0]?.y).toBeLessThanOrEqual(41);
    expect(bands[0]?.height).toBeGreaterThanOrEqual(39);
    expect(bands[0]?.height).toBeLessThanOrEqual(41);

    wrap.remove();
  });

  it("clusters VexFlow path staff strokes into one band", () => {
    const { wrap, svg } = makeWrap();
    for (let i = 0; i < 5; i += 1) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const y = 40 + i * 10;
      path.setAttribute("d", `M20 ${y}L420 ${y}`);
      Object.defineProperty(path, "getBoundingClientRect", {
        value: () => ({
          top: y,
          left: 20,
          width: 400,
          // Real VexFlow strokes often report height 0.
          height: 0,
          bottom: y,
          right: 420,
        }),
      });
      svg.appendChild(path);
    }

    const bands = collectStaffBandsFromDom(wrap);
    expect(bands.length).toBeGreaterThanOrEqual(1);
    expect(bands[0]?.y).toBeGreaterThanOrEqual(40);
    expect(bands[0]?.y).toBeLessThanOrEqual(41);
    expect(bands[0]?.height).toBeGreaterThanOrEqual(39);
    expect(bands[0]?.height).toBeLessThanOrEqual(41);

    wrap.remove();
  });

  it("does not treat vf-stavenote groups as staff bands", () => {
    const { wrap, svg } = makeWrap();
    const note = document.createElementNS("http://www.w3.org/2000/svg", "g");
    note.setAttribute("class", "vf-stavenote");
    Object.defineProperty(note, "getBoundingClientRect", {
      value: () => ({
        top: 70,
        left: 80,
        width: 14,
        height: 12,
        bottom: 82,
        right: 94,
      }),
    });
    svg.appendChild(note);

    expect(collectStaffBandsFromDom(wrap)).toEqual([]);
    wrap.remove();
  });

  it("recognizes horizontal VexFlow path spans", () => {
    expect(horizontalPathSpan("M2.5 17.5L241.045 17.5")).toEqual({
      x0: 2.5,
      x1: 241.045,
      y: 17.5,
    });
    expect(horizontalPathSpan("M74 32.5L74 67.5")).toBeNull();
  });

  it("picks the staff nearest the notes", () => {
    const band = staffBandForNoteGroup(
      [
        { y: 20, height: 40, x: 0, width: 300 },
        { y: 120, height: 40, x: 0, width: 300 },
      ],
      135,
      40,
      100,
    );
    expect(band?.y).toBe(120);
  });
});
