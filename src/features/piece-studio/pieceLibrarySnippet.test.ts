import { describe, expect, it } from "vitest";
import {
  cropSvgToFirstSystem,
  lightenHeavyOpening,
  stripLibrarySnippetWords,
} from "@/features/piece-studio/pieceLibrarySnippet";

function line(y: number): string {
  return `<path d="M20 ${y} L480 ${y}"/>`;
}

describe("cropSvgToFirstSystem", () => {
  it("keeps the first system and drops the next", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.innerHTML = [
      ...[10, 18, 26, 34, 42].map(line),
      ...[120, 128, 136, 144, 152].map(line),
    ].join("");
    expect(cropSvgToFirstSystem(svg)).toBe(true);
    const box = svg.getAttribute("viewBox")?.split(/\s+/).map(Number) ?? [];
    expect(box[1]).toBeLessThan(10);
    expect((box[1] ?? 0) + (box[3] ?? 0)).toBeLessThan(120);
    expect((box[1] ?? 0) + (box[3] ?? 0)).toBeGreaterThan(42);
  });

  it("reads staff lines inside a translated system", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const system = (y: number) =>
      `<g transform="translate(12 ${y})">${[0, 8, 16, 24, 32].map(line).join("")}</g>`;
    svg.innerHTML = system(40) + system(180);
    expect(cropSvgToFirstSystem(svg)).toBe(true);
    const box = svg.getAttribute("viewBox")?.split(/\s+/).map(Number) ?? [];
    expect((box[1] ?? 0) + (box[3] ?? 0)).toBeLessThan(180);
    expect((box[1] ?? 0) + (box[3] ?? 0)).toBeGreaterThan(72);
  });

  it("ignores a beam and keeps the five staff lines", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.innerHTML = [
      `<path d="M80 4 L160 4"/>`,
      ...[20, 28, 36, 44, 52].map(line),
      ...[140, 148, 156, 164, 172].map(line),
    ].join("");
    expect(cropSvgToFirstSystem(svg)).toBe(true);
    const box = svg.getAttribute("viewBox")?.split(/\s+/).map(Number) ?? [];
    expect((box[1] ?? 0) + (box[3] ?? 0)).toBeGreaterThan(52);
    expect((box[1] ?? 0) + (box[3] ?? 0)).toBeLessThan(140);
  });

  it("keeps the first staff when later systems are drawn as shorter segments", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const full = (y: number) => `<path d="M50 ${y} L328 ${y}"/>`;
    const split = (y: number) =>
      `<path d="M50 ${y} L228 ${y}"/><path d="M228 ${y} L328 ${y}"/>`;
    svg.innerHTML = [
      ...[94, 104, 114, 124, 134].map(full),
      ...[231, 241, 251, 261, 271].map(split),
      ...[384, 394, 404, 414, 424].map(split),
    ].join("");
    expect(cropSvgToFirstSystem(svg)).toBe(true);
    const box = svg.getAttribute("viewBox")?.split(/\s+/).map(Number) ?? [];
    expect((box[1] ?? 0) + (box[3] ?? 0)).toBeLessThan(200);
    expect((box[1] ?? 0) + (box[3] ?? 0)).toBeGreaterThan(134);
  });

  it("uses one staff window so a short line and a long line share an aspect ratio", () => {
    const ratio = (x1: number) => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.innerHTML = [20, 30, 40, 50, 60]
        .map((y) => `<path d="M40 ${y} L${x1} ${y}"/>`)
        .join("");
      expect(cropSvgToFirstSystem(svg)).toBe(true);
      const box = svg.getAttribute("viewBox")?.split(/\s+/).map(Number) ?? [];
      return (box[2] ?? 0) / (box[3] ?? 1);
    };
    expect(ratio(180)).toBeCloseTo(ratio(900), 5);
  });

  it("keeps a note whole when it hangs outside the staff window", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 500 200");
    svg.innerHTML = [40, 50, 60, 70, 80]
      .map((y) => `<path d="M30 ${y} L460 ${y}"/>`)
      .join("");
    const note = document.createElementNS("http://www.w3.org/2000/svg", "g");
    note.setAttribute("class", "vf-stavenote");
    svg.appendChild(note);
    const rect = (left: number, top: number, width: number, height: number) =>
      ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON() {
          return {};
        },
      }) as DOMRect;
    svg.getBoundingClientRect = () => rect(0, 0, 500, 200);
    note.getBoundingClientRect = () => rect(120, -28, 36, 24);
    expect(cropSvgToFirstSystem(svg)).toBe(true);
    const box = svg.getAttribute("viewBox")?.split(/\s+/).map(Number) ?? [];
    expect(box[1] ?? 0).toBeLessThan(0);
    expect((box[0] ?? 0) + (box[2] ?? 0)).toBeGreaterThan(150);
  });

  it("leaves out a note whose center sits past the opening", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 800 200");
    svg.innerHTML = [40, 50, 60, 70, 80]
      .map((y) => `<path d="M30 ${y} L700 ${y}"/>`)
      .join("");
    const note = document.createElementNS("http://www.w3.org/2000/svg", "g");
    note.setAttribute("class", "vf-stavenote");
    svg.appendChild(note);
    const rect = (left: number, top: number, width: number, height: number) =>
      ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON() {
          return {};
        },
      }) as DOMRect;
    svg.getBoundingClientRect = () => rect(0, 0, 800, 200);
    note.getBoundingClientRect = () => rect(520, 40, 20, 16);
    expect(cropSvgToFirstSystem(svg)).toBe(true);
    const box = svg.getAttribute("viewBox")?.split(/\s+/).map(Number) ?? [];
    expect((box[0] ?? 0) + (box[2] ?? 0)).toBeLessThan(520);
  });

  it("drops tempo words and dynamic letters from the snippet", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.innerHTML = [
      `<text class="vf-text">♩ = 80</text>`,
      `<text>Allegro</text>`,
      `<g class="vf-dynamic"><text>p</text></g>`,
      ...[20, 30, 40, 50, 60].map((y) => `<path d="M40 ${y} L400 ${y}"/>`),
    ].join("");
    stripLibrarySnippetWords(svg);
    expect(svg.querySelector("text")).toBeNull();
    expect(svg.querySelector("path")).toBeTruthy();
  });

  it("does not let a beam stretch the opening across the rest of the line", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 800 200");
    svg.innerHTML = [40, 50, 60, 70, 80]
      .map((y) => `<path d="M30 ${y} L700 ${y}"/>`)
      .join("");
    const beam = document.createElementNS("http://www.w3.org/2000/svg", "g");
    beam.setAttribute("class", "vf-beam");
    svg.appendChild(beam);
    const rect = (left: number, top: number, width: number, height: number) =>
      ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON() {
          return {};
        },
      }) as DOMRect;
    svg.getBoundingClientRect = () => rect(0, 0, 800, 200);
    beam.getBoundingClientRect = () => rect(40, 28, 520, 18);
    expect(cropSvgToFirstSystem(svg)).toBe(true);
    const box = svg.getAttribute("viewBox")?.split(/\s+/).map(Number) ?? [];
    expect((box[0] ?? 0) + (box[2] ?? 0)).toBeLessThan(360);
  });

  it("stops the frame above the next system", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 500 400");
    svg.innerHTML = [
      ...[40, 50, 60, 70, 80].map((y) => `<path d="M30 ${y} L460 ${y}"/>`),
      ...[200, 210, 220, 230, 240].map((y) => `<path d="M30 ${y} L460 ${y}"/>`),
    ].join("");
    const slur = document.createElementNS("http://www.w3.org/2000/svg", "g");
    slur.setAttribute("class", "vf-curve");
    svg.appendChild(slur);
    const rect = (left: number, top: number, width: number, height: number) =>
      ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON() {
          return {};
        },
      }) as DOMRect;
    svg.getBoundingClientRect = () => rect(0, 0, 500, 400);
    slur.getBoundingClientRect = () => rect(80, 55, 40, 160);
    expect(cropSvgToFirstSystem(svg)).toBe(true);
    const box = svg.getAttribute("viewBox")?.split(/\s+/).map(Number) ?? [];
    expect((box[1] ?? 0) + (box[3] ?? 0)).toBeLessThan(200);
  });

  it("keeps the first two bars instead of the rest of the system", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 800 200");
    svg.innerHTML = [40, 50, 60, 70, 80]
      .map((y) => `<path d="M30 ${y} L760 ${y}"/>`)
      .join("");
    const bars = [36, 140, 250, 520].map((x) => {
      const bar = document.createElementNS("http://www.w3.org/2000/svg", "g");
      bar.setAttribute("class", "vf-stavebarline");
      svg.appendChild(bar);
      return { bar, x };
    });
    const rect = (left: number, top: number, width: number, height: number) =>
      ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON() {
          return {};
        },
      }) as DOMRect;
    svg.getBoundingClientRect = () => rect(0, 0, 800, 200);
    for (const { bar, x } of bars) {
      bar.getBoundingClientRect = () => rect(x, 40, 2, 40);
    }
    expect(cropSvgToFirstSystem(svg)).toBe(true);
    const box = svg.getAttribute("viewBox")?.split(/\s+/).map(Number) ?? [];
    const right = (box[0] ?? 0) + (box[2] ?? 0);
    expect(right).toBeGreaterThan(240);
    expect(right).toBeLessThan(400);
  });

  it("ends on a measure so the next bar is not sliced", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const staff = [40, 50, 60, 70, 80]
      .map((y) => `<path d="M30 ${y} L760 ${y}"/>`)
      .join("");
    const measure = (x0: number, x1: number, y = 40) =>
      `<g class="vf-measure"><path d="M${x0} ${y} L${x1} ${y}"/></g>`;
    svg.innerHTML = [
      staff,
      measure(40, 180),
      measure(180, 320),
      measure(320, 700),
      measure(40, 180, 200),
    ].join("");
    expect(cropSvgToFirstSystem(svg)).toBe(true);
    const box = svg.getAttribute("viewBox")?.split(/\s+/).map(Number) ?? [];
    const right = (box[0] ?? 0) + (box[2] ?? 0);
    expect(right).toBeGreaterThan(310);
    expect(right).toBeLessThan(360);
    expect(svg.querySelectorAll(".vf-measure")).toHaveLength(2);
    expect((box[1] ?? 0) + (box[3] ?? 0)).toBeLessThan(160);
  });

  it("keeps only the start of a bar when the notes are packed together", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 800 200");
    svg.innerHTML = [
      ...[40, 50, 60, 70, 80].map((y) => `<path d="M30 ${y} L760 ${y}"/>`),
      `<g class="vf-measure"><path d="M40 40 L520 40"/></g>`,
    ].join("");
    const heads = Array.from({ length: 16 }, (_, i) => {
      const head = document.createElementNS("http://www.w3.org/2000/svg", "g");
      head.setAttribute("class", "vf-notehead");
      svg.appendChild(head);
      return { head, x: 90 + i * 22 };
    });
    const rect = (left: number, top: number, width: number, height: number) =>
      ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON() {
          return {};
        },
      }) as DOMRect;
    svg.getBoundingClientRect = () => rect(0, 0, 800, 200);
    for (const { head, x } of heads) {
      head.getBoundingClientRect = () => rect(x, 48, 10, 8);
    }
    expect(cropSvgToFirstSystem(svg)).toBe(true);
    const box = svg.getAttribute("viewBox")?.split(/\s+/).map(Number) ?? [];
    const right = (box[0] ?? 0) + (box[2] ?? 0);
    expect(right).toBeGreaterThan(160);
    expect(right).toBeLessThan(220);
    expect(svg.querySelector(".vf-measure")).toBeTruthy();
  });
});

describe("lightenHeavyOpening", () => {
  function measure(notes: string, number = 1): string {
    return `<measure number="${number}"><attributes><divisions>4</divisions><clef><sign>G</sign><line>2</line></clef></attributes>${notes}</measure>`;
  }
  function note(step: string, extra = ""): string {
    return `<note>${extra}<pitch><step>${step}</step><octave>5</octave></pitch><duration>1</duration><type>16th</type><beam number="1">continue</beam></note>`;
  }

  it("leaves a short opening unchanged", () => {
    const xml = `<score-partwise><part>${measure([1, 2, 3, 4].map(() => note("C")).join(""))}${measure(note("D"), 2)}</part></score-partwise>`;
    expect(lightenHeavyOpening(xml)).toBeNull();
  });

  it("keeps the first few notes of a packed bar and drops the rest", () => {
    const packed = Array.from({ length: 12 }, (_, i) => note(String.fromCharCode(65 + (i % 7)))).join("");
    const xml = `<score-partwise><part>${measure(packed)}${measure(note("D"), 2)}</part></score-partwise>`;
    const light = lightenHeavyOpening(xml);
    expect(light).toBeTruthy();
    expect(light?.match(/<note\b/g)?.length).toBe(5);
    expect(light).not.toContain("measure number=\"2\"");
    expect(light).toContain("<clef>");
    expect(light).not.toContain("<beam");
  });

  it("keeps chord tones with the note they belong to", () => {
    const chord = `<note><chord/><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><type>16th</type></note>`;
    const packed = [note("C"), chord, ...Array.from({ length: 10 }, () => note("D"))].join("");
    const xml = `<score-partwise><part>${measure(packed)}</part></score-partwise>`;
    const light = lightenHeavyOpening(xml);
    expect(light?.match(/<note\b/g)?.length).toBe(6);
    expect(light).toContain("<chord/>");
  });
});
