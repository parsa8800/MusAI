import { describe, expect, it } from "vitest";
import {
  cropSvgToFirstSystem,
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
    note.getBoundingClientRect = () => rect(300, -28, 36, 24);
    expect(cropSvgToFirstSystem(svg)).toBe(true);
    const box = svg.getAttribute("viewBox")?.split(/\s+/).map(Number) ?? [];
    expect(box[1] ?? 0).toBeLessThan(-6);
    expect((box[0] ?? 0) + (box[2] ?? 0)).toBeGreaterThan(330);
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

  it("keeps only the opening when the first line is crowded with noteheads", () => {
    const widthFor = (count: number, step: number) => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 800 200");
      svg.innerHTML = [40, 50, 60, 70, 80]
        .map((y) => `<path d="M30 ${y} L700 ${y}"/>`)
        .join("");
      const notes: SVGElement[] = [];
      for (let i = 0; i < count; i += 1) {
        const note = document.createElementNS("http://www.w3.org/2000/svg", "g");
        note.setAttribute("class", "vf-stavenote");
        svg.appendChild(note);
        notes.push(note);
      }
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
      notes.forEach((note, i) => {
        note.getBoundingClientRect = () => rect(70 + i * step, 52, 8, 8);
      });
      expect(cropSvgToFirstSystem(svg)).toBe(true);
      const box = svg.getAttribute("viewBox")?.split(/\s+/).map(Number) ?? [];
      return box[2] ?? 0;
    };

    const crowded = widthFor(20, 12);
    const sparse = widthFor(4, 40);
    expect(crowded).toBeLessThan(230);
    expect(sparse).toBeGreaterThan(280);
  });
});
