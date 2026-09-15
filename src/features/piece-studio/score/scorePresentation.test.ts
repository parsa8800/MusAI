import { describe, expect, it } from "vitest";
import {
  classifyScoreScrollDensity,
  clampScorePageIndex,
  continuousZoomBoost,
  pieceOsmdZoomForPresentation,
  pieceScoreOsmdPageFormat,
  shouldOfferScoreViewModes,
} from "@/features/piece-studio/score/scorePresentation";

describe("score presentation layout", () => {
  it("uses Endless for continuous and A4 for page/overview", () => {
    expect(pieceScoreOsmdPageFormat("continuous")).toBe("Endless");
    expect(pieceScoreOsmdPageFormat("page")).toBe("A4_P");
    expect(pieceScoreOsmdPageFormat("overview")).toBe("A4_P");
  });

  it("keeps overview zoom small and continuous readable", () => {
    const continuous = pieceOsmdZoomForPresentation(900, 700, "continuous");
    const overview = pieceOsmdZoomForPresentation(900, 700, "overview");
    const page = pieceOsmdZoomForPresentation(900, 700, "page");
    expect(overview).toBeLessThan(0.5);
    expect(continuous).toBeLessThanOrEqual(1.08);
    expect(page).toBeGreaterThan(continuous);
  });

  it("packs import-preview at staff zoom ≤ 1 so short pieces stay one line", () => {
    const workspace = pieceOsmdZoomForPresentation(720, 560, "continuous");
    const preview = pieceOsmdZoomForPresentation(
      720,
      560,
      "continuous",
      "import-preview",
    );
    expect(preview).toBeLessThanOrEqual(1);
    expect(workspace).toBeLessThanOrEqual(1.08);
    expect(preview).toBeLessThanOrEqual(workspace);
  });

  it("does not OSMD-zoom-boost workspace Continuous (display scale keeps one line)", () => {
    expect(
      continuousZoomBoost(
        1.3,
        { contentWidthPx: 280, contentHeightPx: 140, systemCount: 1 },
        720,
        640,
        "workspace",
      ),
    ).toBeNull();
  });

  it("does not stretch workspace zoom to fill leftover stage height", () => {
    expect(
      continuousZoomBoost(
        1.4,
        { contentWidthPx: 600, contentHeightPx: 340, systemCount: 2 },
        720,
        640,
      ),
    ).toBeNull();
  });

  it("does not OSMD-zoom-boost import-preview (display scale handles size)", () => {
    expect(
      continuousZoomBoost(
        1.5,
        { contentWidthPx: 320, contentHeightPx: 220, systemCount: 3 },
        720,
        520,
        "import-preview",
      ),
    ).toBeNull();
  });

  it("scales import-preview hosts up to a comfortable card size", async () => {
    const { scaleOsmdHostToImportPreview } = await import(
      "@/features/piece-studio/score/scorePresentation"
    );
    const host = document.createElement("div");
    document.body.appendChild(host);
    const page = document.createElement("div");
    page.id = "osmdCanvasPage1";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "320");
    svg.setAttribute("height", "180");
    svg.setAttribute("viewBox", "0 0 320 180");
    page.appendChild(svg);
    host.appendChild(page);

    const scaled = scaleOsmdHostToImportPreview(host, 720, 480, {
      contentWidthPx: 320,
      contentHeightPx: 180,
    });
    expect(scaled.contentWidthPx).toBeGreaterThan(450);
    expect(scaled.contentWidthPx).toBeLessThanOrEqual(720 * 0.88 + 1);
    expect(scaled.contentHeightPx).toBeGreaterThan(240);
    expect(Number.parseFloat(svg.style.width)).toBeGreaterThan(450);
    host.remove();
  });

  it("scales workspace short scores up for healthy reading size", async () => {
    const { scaleOsmdHostToWorkspaceReading } = await import(
      "@/features/piece-studio/score/scorePresentation"
    );
    const host = document.createElement("div");
    document.body.appendChild(host);
    const page = document.createElement("div");
    page.id = "osmdCanvasPage1";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "420");
    svg.setAttribute("height", "120");
    svg.setAttribute("viewBox", "0 0 420 120");
    page.appendChild(svg);
    host.appendChild(page);

    const scaled = scaleOsmdHostToWorkspaceReading(host, 900, 700, {
      contentWidthPx: 420,
      contentHeightPx: 120,
      systemCount: 1,
    });
    // One-liner Twinkle-scale score should grow toward stage width.
    expect(scaled.contentWidthPx).toBeGreaterThan(620);
    expect(scaled.contentWidthPx).toBeLessThanOrEqual(900 * 0.94 + 1);
    expect(scaled.contentHeightPx).toBeGreaterThan(180);
    expect(Number.parseFloat(svg.style.width)).toBeGreaterThan(620);
    host.remove();
  });

  it("does not balloon multi-system workspace scores past three systems", async () => {
    const { scaleOsmdHostToWorkspaceReading } = await import(
      "@/features/piece-studio/score/scorePresentation"
    );
    const host = document.createElement("div");
    const scaled = scaleOsmdHostToWorkspaceReading(host, 900, 700, {
      contentWidthPx: 700,
      contentHeightPx: 900,
      systemCount: 5,
    });
    expect(scaled.contentWidthPx).toBe(700);
    expect(scaled.contentHeightPx).toBe(900);
  });

  it("climbs single-system import zoom steps for readable notes", async () => {
    const { nextImportPreviewSingleSystemZoom } = await import(
      "@/features/piece-studio/score/scorePresentation"
    );
    expect(nextImportPreviewSingleSystemZoom(1)).toBe(1.05);
    expect(nextImportPreviewSingleSystemZoom(1.15)).toBe(1.18);
    expect(nextImportPreviewSingleSystemZoom(1.18)).toBeNull();
  });

  it("crops import-preview empty page sides so the staff can centre", async () => {
    const { centerCropOsmdHostToMusic } = await import(
      "@/features/piece-studio/score/scorePresentation"
    );
    const host = document.createElement("div");
    document.body.appendChild(host);
    const page = document.createElement("div");
    page.id = "osmdCanvasPage1";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "700");
    svg.setAttribute("height", "200");
    svg.setAttribute("viewBox", "0 0 700 200");
    // Engraved music sits left-of-centre on a wide Endless page.
    const staff = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    staff.setAttribute("x", "40");
    staff.setAttribute("y", "60");
    staff.setAttribute("width", "480");
    staff.setAttribute("height", "80");
    svg.appendChild(staff);
    svg.getBBox = () =>
      ({
        x: 40,
        y: 60,
        width: 480,
        height: 80,
      }) as DOMRect;
    page.appendChild(svg);
    host.appendChild(page);

    const cropped = centerCropOsmdHostToMusic(host);
    expect(cropped.contentWidthPx).toBeLessThan(700);
    expect(cropped.contentWidthPx).toBeGreaterThan(480);
    expect(host.style.marginInline).toBe("auto");
    expect(svg.style.marginInline).toBe("auto");
    host.remove();
  });
  it("does not shrink import-preview hosts that already fill the card", async () => {
    const { scaleOsmdHostToImportPreview } = await import(
      "@/features/piece-studio/score/scorePresentation"
    );
    const host = document.createElement("div");
    const scaled = scaleOsmdHostToImportPreview(host, 720, 480, {
      contentWidthPx: 700,
      contentHeightPx: 420,
    });
    expect(scaled.contentWidthPx).toBe(700);
    expect(scaled.contentHeightPx).toBe(420);
  });

  it("does not boost tall multi-system continuous scores", () => {
    expect(
      continuousZoomBoost(
        1.4,
        { contentWidthPx: 700, contentHeightPx: 900, systemCount: 5 },
        720,
        640,
      ),
    ).toBeNull();
  });

  it("classifies short single-system scores as compact", () => {
    expect(
      classifyScoreScrollDensity(
        { pageCount: 1, systemCount: 1, contentHeightPx: 220 },
        700,
      ),
    ).toBe("compact");
  });

  it("classifies multi-system or tall scores as scroll", () => {
    expect(
      classifyScoreScrollDensity(
        { pageCount: 1, systemCount: 4, contentHeightPx: 400 },
        700,
      ),
    ).toBe("scroll");
    expect(
      classifyScoreScrollDensity(
        { pageCount: 2, systemCount: 2, contentHeightPx: 300 },
        700,
      ),
    ).toBe("scroll");
  });

  it("offers view modes only when pagination helps", () => {
    expect(
      shouldOfferScoreViewModes(
        { pageCount: 1, systemCount: 1, contentHeightPx: 200 },
        700,
      ),
    ).toBe(false);
    expect(
      shouldOfferScoreViewModes(
        { pageCount: 1, systemCount: 3, contentHeightPx: 400 },
        700,
      ),
    ).toBe(false);
    expect(
      shouldOfferScoreViewModes(
        { pageCount: 3, systemCount: 6, contentHeightPx: 2000 },
        700,
      ),
    ).toBe(true);
  });

  it("clamps page index", () => {
    expect(clampScorePageIndex(-1, 3)).toBe(0);
    expect(clampScorePageIndex(9, 3)).toBe(2);
    expect(clampScorePageIndex(1, 0)).toBe(0);
  });
});
