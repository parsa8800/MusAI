import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

const addImage = vi.fn();
const text = vi.fn();
const addPage = vi.fn();
const output = vi.fn(
  () => new Blob(["%PDF-1.4 mock"], { type: "application/pdf" }),
);

vi.mock("jspdf", () => {
  class MockJsPDF {
    #pages = 1;
    internal = { pageSize: { getWidth: () => 595, getHeight: () => 842 } };
    setFont = vi.fn();
    setFontSize = vi.fn();
    setTextColor = vi.fn();
    text = text;
    addImage = addImage;
    addPage = () => {
      this.#pages += 1;
      addPage();
    };
    getNumberOfPages = () => this.#pages;
    output = output;
  }
  return { jsPDF: MockJsPDF };
});

import {
  buildPieceScorePdfBlob,
  chooseSliceEnd,
  countPieceScoreSvgs,
  downloadPieceScorePdf,
  openPieceScorePdf,
  sliceScorePngToPages,
  systemsFromRgba,
} from "@/features/piece-studio/score/exportPieceScorePdf";

function mountScoreSvg(
  size: { width: number; height: number } = { width: 400, height: 120 },
) {
  const host = document.createElement("div");
  host.setAttribute("data-testid", "piece-osmd");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);
  svg.setAttribute("width", String(size.width));
  svg.setAttribute("height", String(size.height));
  Object.defineProperty(svg, "getBoundingClientRect", {
    value: () => ({
      width: size.width,
      height: size.height,
      top: 0,
      left: 0,
      right: size.width,
      bottom: size.height,
    }),
  });
  host.appendChild(svg);
  document.body.appendChild(host);
  return host;
}

function stubRasterPipeline(natural = { width: 800, height: 240 }) {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = natural.width;
    naturalHeight = natural.height;
    set src(_v: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal("Image", FakeImage);

  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      fillStyle: "",
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    }),
    toDataURL: () => "data:image/png;base64,AAA",
  };
  const realCreate = Document.prototype.createElement;
  vi.spyOn(document, "createElement").mockImplementation(function (
    this: Document,
    tag: string,
    options?: ElementCreationOptions,
  ) {
    if (tag === "canvas") return canvas as unknown as HTMLCanvasElement;
    return realCreate.call(this, tag, options);
  });
  return canvas;
}

describe("exportPieceScorePdf", () => {
  beforeEach(() => {
    addImage.mockClear();
    text.mockClear();
    addPage.mockClear();
    output.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("reports no_score when engraving is missing", async () => {
    expect(await openPieceScorePdf({ title: "Twinkle" })).toEqual({
      ok: false,
      reason: "no_score",
    });
    expect(countPieceScoreSvgs()).toBe(0);
  });

  it("builds a real PDF blob without calling print", async () => {
    mountScoreSvg();
    stubRasterPipeline();
    const print = vi.fn();
    window.print = print;

    const built = await buildPieceScorePdfBlob({ title: "Twinkle Twinkle" });
    expect(built).not.toBeNull();
    expect(built?.fileName).toBe("Twinkle-Twinkle.pdf");
    expect(built?.blob.type).toMatch(/pdf/);
    expect(addImage).toHaveBeenCalled();
    expect(text).toHaveBeenCalledWith(
      "Twinkle Twinkle",
      expect.any(Number),
      expect.any(Number),
      { align: "center" },
    );
    expect(print).not.toHaveBeenCalled();
  });

  it("slices a tall continuous score across multiple A4 pages at full width", async () => {
    mountScoreSvg({ width: 400, height: 4000 });
    stubRasterPipeline({ width: 800, height: 8000 });

    await buildPieceScorePdfBlob({ title: "Paganini 24" });
    // Tall strip must not be smashed onto one page.
    expect(addPage.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(addImage.mock.calls.length).toBeGreaterThanOrEqual(3);
    // Drawn at full content width (595 - 2*36 = 523).
    for (const call of addImage.mock.calls) {
      expect(call[4]).toBeCloseTo(523, 0);
    }
  });

  it("sliceScorePngToPages fills width and paginates height", async () => {
    stubRasterPipeline({ width: 400, height: 2000 });

    const pages = await sliceScorePngToPages(
      { dataUrl: "data:image/png;base64,x", width: 200, height: 1000 },
      500,
      400,
    );
    // widthScale=2.5 → max slice logical = 400/2.5=160 → 1000/160 ≈ 7 pages
    expect(pages.length).toBeGreaterThanOrEqual(6);
    expect(pages.every((p) => p.width === 500)).toBe(true);
  });

  it("keeps a page break in the gap between systems", () => {
    const systems = [
      { top: 10, bottom: 80 },
      { top: 160, bottom: 230 },
      { top: 320, bottom: 400 },
    ];
    // A hard cut at 200 would slice the second system (160–230).
    expect(chooseSliceEnd(0, 200, 500, systems)).toBeCloseTo(120);
    const next = chooseSliceEnd(120, 320, 500, systems);
    expect(next).toBeGreaterThanOrEqual(230);
    expect(next).toBeLessThan(320);
  });

  it("groups staff lines into systems and leaves the gap between them", () => {
    const width = 40;
    const height = 120;
    const data = new Uint8ClampedArray(width * height * 4);
    data.fill(255);
    const inkRows = [10, 14, 18, 22, 26, 80, 84, 88, 92, 96];
    for (const y of inkRows) {
      for (let x = 4; x < 36; x += 1) {
        const i = (y * width + x) * 4;
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
      }
    }
    const systems = systemsFromRgba(data, width, height, height);
    expect(systems).toHaveLength(2);
    expect(systems[0]!.bottom).toBeLessThan(40);
    expect(systems[1]!.top).toBeGreaterThan(70);
    const end = chooseSliceEnd(0, 70, height, systems);
    expect(end).toBeGreaterThan(systems[0]!.bottom);
    expect(end).toBeLessThan(systems[1]!.top);
  });

  it("opens a blob URL tab and never calls window.print", async () => {
    mountScoreSvg();
    stubRasterPipeline();
    const print = vi.fn();
    window.print = print;
    const open = vi.fn(() => ({ focus: vi.fn() }) as unknown as Window);
    vi.stubGlobal("open", open);

    const result = await openPieceScorePdf({ title: "Twinkle" });
    expect(result).toEqual({ ok: true, mode: "view" });
    expect(open).toHaveBeenCalled();
    const openedUrl = String((open.mock.calls as unknown[][])[0]?.[0] ?? "");
    expect(openedUrl).toMatch(/^blob:/);
    expect(print).not.toHaveBeenCalled();
  });

  it("downloads when requested", async () => {
    mountScoreSvg();
    stubRasterPipeline();
    const click = vi.fn();
    const realCreate = Document.prototype.createElement;
    vi.spyOn(document, "createElement").mockImplementation(function (
      this: Document,
      tag: string,
      options?: ElementCreationOptions,
    ) {
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            fillStyle: "",
            fillRect: vi.fn(),
            drawImage: vi.fn(),
          }),
          toDataURL: () => "data:image/png;base64,AAA",
        } as unknown as HTMLCanvasElement;
      }
      const el = realCreate.call(this, tag, options);
      if (tag === "a") {
        Object.defineProperty(el, "click", { value: click });
      }
      return el;
    });
    class FakeImage {
      onload: (() => void) | null = null;
      naturalWidth = 800;
      naturalHeight = 240;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FakeImage);

    const result = await downloadPieceScorePdf({ title: "Twinkle" });
    expect(result).toEqual({ ok: true, mode: "download" });
    expect(click).toHaveBeenCalled();
  });
});
