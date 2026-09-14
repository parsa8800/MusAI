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
    expect(continuous).toBeGreaterThan(page);
    expect(continuous).toBeLessThanOrEqual(1.58);
  });

  it("boosts continuous zoom for short scores that look lost", () => {
    const boosted = continuousZoomBoost(
      1.3,
      { contentWidthPx: 280, contentHeightPx: 140, systemCount: 1 },
      720,
      640,
    );
    expect(boosted).toBeGreaterThan(1.3);
    expect(boosted).toBeLessThanOrEqual(1.85);
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
