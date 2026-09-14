/**
 * Piece Studio score presentation — layout policy for Continuous / Page / Overview.
 * Pure helpers only (no OSMD import). Used by the score renderer + React shell.
 */

export type PieceScoreViewMode = "continuous" | "page" | "overview";

export const PIECE_SCORE_VIEW_MODES: readonly PieceScoreViewMode[] = [
  "continuous",
  "page",
  "overview",
] as const;

export type ScoreLayoutMetrics = {
  pageCount: number;
  systemCount: number;
  /** Engraved content width in CSS pixels (after fit). */
  contentWidthPx: number;
  /** Engraved content height in CSS pixels (after fit). */
  contentHeightPx: number;
};

/** How the score sits in the stage after engraving. */
export type ScoreScrollDensity = "compact" | "scroll";

export type ScorePaintOptions = {
  viewMode: PieceScoreViewMode;
  viewportWidthPx: number;
  viewportHeightPx: number;
};

export function isPieceScoreViewMode(v: string): v is PieceScoreViewMode {
  return (PIECE_SCORE_VIEW_MODES as readonly string[]).includes(v);
}

/** OSMD page format string — Endless for continuous reader; A4 portrait for pages. */
export function pieceScoreOsmdPageFormat(
  mode: PieceScoreViewMode,
): "Endless" | "A4_P" {
  return mode === "continuous" ? "Endless" : "A4_P";
}

/**
 * Staff zoom from viewport. Continuous aims for readable staff size;
 * Page stays moderate; Overview stays thumbnail-dense.
 * Height informs continuous sizing so short stages don’t under-zoom.
 */
export function pieceOsmdZoomForPresentation(
  viewportWidthPx: number,
  viewportHeightPx: number,
  mode: PieceScoreViewMode,
): number {
  const w = Math.max(0, viewportWidthPx);
  const h = Math.max(0, viewportHeightPx);

  let zoom: number;
  if (w < 340) zoom = 1.22;
  else if (w < 420) zoom = 1.32;
  else if (w < 560) zoom = 1.4;
  else if (w < 720) zoom = 1.48;
  else if (w < 960) zoom = 1.54;
  else zoom = 1.58;

  // Tall, narrow stages: keep staff a touch larger so systems don’t look sparse.
  if (h > 0 && h < 420 && mode === "continuous") {
    zoom = Math.min(1.62, zoom + 0.04);
  }

  if (mode === "overview") {
    return Math.min(0.42, zoom * 0.28);
  }
  if (mode === "page") {
    return Math.min(zoom, 1.32);
  }
  if (w >= 1100) return Math.min(zoom, 1.56);
  return zoom;
}

/**
 * After a first Continuous paint, bump zoom once when the engraved score is
 * still small relative to the stage — short pieces should feel present, not lost.
 */
export function continuousZoomBoost(
  baseZoom: number,
  metrics: Pick<ScoreLayoutMetrics, "contentWidthPx" | "contentHeightPx" | "systemCount">,
  viewportWidthPx: number,
  viewportHeightPx: number,
): number | null {
  const vw = Math.max(1, viewportWidthPx);
  const vh = Math.max(1, viewportHeightPx);
  if (metrics.systemCount > 3) return null;
  if (metrics.contentWidthPx < 1 || metrics.contentHeightPx < 1) return null;

  const widthRatio = metrics.contentWidthPx / vw;
  const heightRatio = metrics.contentHeightPx / vh;
  // Already filling a sensible share of the stage.
  if (widthRatio >= 0.88 || heightRatio >= 0.62) return null;

  const targetWidth = vw * (metrics.systemCount <= 1 ? 0.94 : 0.9);
  const byWidth = targetWidth / metrics.contentWidthPx;
  const targetHeight = vh * (metrics.systemCount <= 1 ? 0.68 : 0.58);
  const byHeight = targetHeight / metrics.contentHeightPx;
  const factor = Math.min(byWidth, byHeight, metrics.systemCount <= 1 ? 1.7 : 1.5);
  if (factor < 1.05) return null;
  const next = Math.min(1.85, baseZoom * factor);
  if (next <= baseZoom * 1.03) return null;
  return next;
}

/**
 * Compact = short score that should sit centred in the stage.
 * Scroll = multi-system / multi-page music that reads top-down with natural wrapping.
 */
export function classifyScoreScrollDensity(
  metrics: Pick<ScoreLayoutMetrics, "pageCount" | "systemCount" | "contentHeightPx">,
  viewportHeightPx: number,
): ScoreScrollDensity {
  const vh = Math.max(1, viewportHeightPx);
  if (metrics.pageCount > 1) return "scroll";
  if (metrics.systemCount >= 4) return "scroll";
  if (metrics.systemCount >= 3 && metrics.contentHeightPx > vh * 0.55) {
    return "scroll";
  }
  if (metrics.contentHeightPx > vh * 0.78) return "scroll";
  return "compact";
}

/**
 * Show Continuous / Page / Overview only when pagination actually helps.
 * Very short pieces stay Continuous-only — no chrome clutter.
 */
export function shouldOfferScoreViewModes(
  metrics: Pick<ScoreLayoutMetrics, "pageCount" | "systemCount" | "contentHeightPx">,
  viewportHeightPx: number,
): boolean {
  if (metrics.pageCount > 1) return true;
  if (metrics.systemCount >= 5) return true;
  if (metrics.contentHeightPx > Math.max(520, viewportHeightPx * 1.25)) {
    return true;
  }
  return false;
}

export function clampScorePageIndex(pageIndex: number, pageCount: number): number {
  if (pageCount <= 0) return 0;
  return Math.min(Math.max(0, pageIndex), pageCount - 1);
}

function readSvgContentSize(svg: SVGSVGElement): { w: number; h: number } {
  const vb = svg.viewBox?.baseVal;
  let w = Number(svg.getAttribute("width")) || 0;
  let h = Number(svg.getAttribute("height")) || 0;
  if (vb && vb.width > 0 && vb.height > 0) {
    w = vb.width;
    h = vb.height;
  }

  // Prefer the engraved bbox when the page canvas is mostly empty (A4 leftovers).
  try {
    const bbox = svg.getBBox();
    if (bbox.width > 8 && bbox.height > 8) {
      const padX = Math.max(8, bbox.width * 0.02);
      const padY = Math.max(8, bbox.height * 0.03);
      const contentW = bbox.width + padX * 2;
      const contentH = bbox.height + padY * 2;
      // Only crop when the page is clearly larger than the music.
      if (w > contentW * 1.12 || h > contentH * 1.18) {
        const x = Math.max(0, bbox.x - padX);
        const y = Math.max(0, bbox.y - padY);
        svg.setAttribute("viewBox", `${x} ${y} ${contentW} ${contentH}`);
        w = contentW;
        h = contentH;
      }
    }
  } catch {
    /* getBBox can throw if the SVG is not rendered yet */
  }

  return { w, h };
}

/**
 * After OSMD paints, size each SVG to its musical content and centre the host.
 * Avoids full-bleed empty SVG canvases that make short scores look lost.
 */
export function fitOsmdHostToContent(host: HTMLElement): {
  contentWidthPx: number;
  contentHeightPx: number;
} {
  const svgs = [...host.querySelectorAll("svg")] as SVGSVGElement[];
  if (svgs.length === 0) {
    return { contentWidthPx: 0, contentHeightPx: 0 };
  }

  let maxW = 0;
  let totalH = 0;
  for (const svg of svgs) {
    const { w, h } = readSvgContentSize(svg);
    if (w > 0) {
      svg.setAttribute("width", String(w));
      svg.setAttribute("height", String(h));
    }
    svg.style.width = "auto";
    svg.style.height = "auto";
    svg.style.maxWidth = "100%";
    svg.style.display = "block";
    svg.style.marginInline = "auto";
    maxW = Math.max(maxW, w);
    totalH += h;
  }

  host.style.width = "fit-content";
  host.style.maxWidth = "100%";
  host.style.marginInline = "auto";
  host.style.height = "fit-content";

  return { contentWidthPx: maxW, contentHeightPx: totalH };
}

/** Soft page margins so Continuous/Page music sits closer to the stage edges. */
export type PieceOsmdMarginRules = {
  PageLeftMargin?: number;
  PageRightMargin?: number;
  PageTopMargin?: number;
  PageBottomMargin?: number;
  PageTopMarginNarrow?: number;
};

export function applyPieceOsmdPageMargins(
  rules: PieceOsmdMarginRules | null | undefined,
  mode: PieceScoreViewMode,
): void {
  if (!rules) return;
  if (mode === "continuous") {
    rules.PageLeftMargin = 0.25;
    rules.PageRightMargin = 0.25;
    rules.PageTopMargin = 0.18;
    rules.PageBottomMargin = 0.28;
    rules.PageTopMarginNarrow = 0.14;
    return;
  }
  if (mode === "page") {
    rules.PageLeftMargin = 0.45;
    rules.PageRightMargin = 0.45;
    rules.PageTopMargin = 0.4;
    rules.PageBottomMargin = 0.5;
    rules.PageTopMarginNarrow = 0.3;
    return;
  }
  // Overview: keep modest margins so thumbnails stay dense.
  rules.PageLeftMargin = 0.45;
  rules.PageRightMargin = 0.45;
  rules.PageTopMargin = 0.35;
  rules.PageBottomMargin = 0.4;
  rules.PageTopMarginNarrow = 0.25;
}
