import { describe, expect, it } from "vitest";
import { hostHasVisibleEngraving } from "@/features/piece-studio/score/OsmdScoreAdapter";

describe("hostHasVisibleEngraving", () => {
  it("rejects empty hosts and empty SVG shells", () => {
    const host = document.createElement("div");
    expect(hostHasVisibleEngraving(host)).toBe(false);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "400");
    svg.setAttribute("height", "200");
    host.appendChild(svg);
    expect(hostHasVisibleEngraving(host)).toBe(false);
  });

  it("rejects large attributed shells with only cursor chrome", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "800");
    svg.setAttribute("height", "600");
    const cursor = document.createElementNS("http://www.w3.org/2000/svg", "g");
    cursor.setAttribute("class", "cursor");
    for (let i = 0; i < 12; i++) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M0 0 L1 1");
      cursor.appendChild(path);
    }
    svg.appendChild(cursor);
    host.appendChild(svg);
    expect(hostHasVisibleEngraving(host)).toBe(false);
    host.remove();
  });

  it("accepts SVGs with enough drawn marks and size", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "320");
    svg.setAttribute("height", "120");
    for (let i = 0; i < 10; i++) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", "0");
      line.setAttribute("y1", String(i * 10));
      line.setAttribute("x2", "300");
      line.setAttribute("y2", String(i * 10));
      svg.appendChild(line);
    }
    // jsdom/happy-dom often report empty getBBox — stub a real staff extent.
    svg.getBBox = () =>
      ({
        x: 0,
        y: 0,
        width: 300,
        height: 100,
      }) as DOMRect;
    host.appendChild(svg);
    expect(hostHasVisibleEngraving(host)).toBe(true);
    host.remove();
  });

  it("rejects OSMD page wrappers collapsed to width 0", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const page = document.createElement("div");
    page.id = "osmdCanvasPage1";
    page.style.width = "0px";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "400");
    svg.setAttribute("height", "200");
    for (let i = 0; i < 10; i++) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", "0");
      line.setAttribute("y1", String(i * 10));
      line.setAttribute("x2", "300");
      line.setAttribute("y2", String(i * 10));
      svg.appendChild(line);
    }
    svg.getBBox = () =>
      ({
        x: 0,
        y: 0,
        width: 300,
        height: 100,
      }) as DOMRect;
    page.appendChild(svg);
    host.appendChild(page);
    expect(hostHasVisibleEngraving(host)).toBe(false);
    host.remove();
  });
});
