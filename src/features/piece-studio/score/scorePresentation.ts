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
  /** Import review: larger staff, fill the card, no sparse “postage stamp” look. */
  purpose?: "workspace" | "import-preview";
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
  purpose: ScorePaintOptions["purpose"] = "workspace",
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
  if (purpose === "import-preview") {
    // Pack measures across the full staff width. Higher OSMD zoom wraps short
    // pieces into ragged 2–3 system stubs; display size comes from SVG scale.
    return Math.min(1.0, zoom);
  }
  // Workspace Continuous: keep OSMD zoom modest so short pieces stay on one
  // system; readable size comes from display scale after paint.
  if (mode === "continuous") {
    return Math.min(1.08, zoom);
  }
  if (w >= 1100) return Math.min(zoom, 1.56);
  return zoom;
}

/**
 * After a first Continuous paint, bump zoom once when the engraved score is
 * still small relative to the stage — short pieces should feel present, not lost.
 * Workspace uses display scale instead (avoids wrapping Twinkle onto 2 systems).
 */
export function continuousZoomBoost(
  baseZoom: number,
  metrics: Pick<ScoreLayoutMetrics, "contentWidthPx" | "contentHeightPx" | "systemCount">,
  viewportWidthPx: number,
  viewportHeightPx: number,
  purpose: ScorePaintOptions["purpose"] = "workspace",
): number | null {
  // Import review + workspace Continuous: SVG display scale handles presence.
  // OSMD zoom boosts wrap short pieces into uneven systems.
  if (purpose === "import-preview" || purpose === "workspace") return null;

  const vw = Math.max(1, viewportWidthPx);
  const vh = Math.max(1, viewportHeightPx);
  if (metrics.systemCount > 3) return null;
  if (metrics.contentWidthPx < 1 || metrics.contentHeightPx < 1) return null;

  const widthRatio = metrics.contentWidthPx / vw;
  const heightRatio = metrics.contentHeightPx / vh;
  // Already filling a sensible share of a card-sized region.
  if (widthRatio >= 0.82 || heightRatio >= 0.5) return null;

  const targetWidth = vw * (metrics.systemCount <= 1 ? 0.86 : 0.8);
  const byWidth = targetWidth / metrics.contentWidthPx;
  const targetHeight = vh * (metrics.systemCount <= 1 ? 0.36 : 0.48);
  const byHeight = targetHeight / metrics.contentHeightPx;
  const factor = Math.min(byWidth, byHeight, metrics.systemCount <= 1 ? 1.45 : 1.32);
  if (factor < 1.05) return null;
  const next = Math.min(1.72, baseZoom * factor);
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

function readSvgContentSize(
  svg: SVGSVGElement,
  options?: { cropEmptyPage?: boolean },
): { w: number; h: number } {
  const cropEmptyPage = options?.cropEmptyPage !== false;
  let w = Number(svg.getAttribute("width")) || 0;
  let h = Number(svg.getAttribute("height")) || 0;

  // Import review: keep OSMD’s page pixel size. A tight viewBox here was
  // collapsing Continuous short scores to an unreadable ~100px staff.
  if (!cropEmptyPage && w > 0 && h > 0) {
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    return { w, h };
  }

  const vb = svg.viewBox?.baseVal;
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
 * OSMD must measure a real container width before every render().
 * After fitOsmdHostToContent the host is shrink-wrapped — restore viewport
 * width before any zoom-boost / re-paint or SkyBottomLine engraves blank.
 */
export function prepareOsmdHostForPaint(
  host: HTMLElement,
  viewportWidthPx: number,
): void {
  const w = Math.floor(Math.max(0, viewportWidthPx));
  host.style.width = w > 0 ? `${w}px` : "100%";
  host.style.maxWidth = "100%";
  host.style.boxSizing = "border-box";
  host.style.marginInline = "auto";
  host.style.height = "";
  // Clear OSMD page wrappers left at width:0 from a prior collapsed fit.
  for (const page of host.querySelectorAll<HTMLElement>(
    '[id^="osmdCanvasPage"]',
  )) {
    page.style.width = "";
    page.style.height = "";
    page.style.maxWidth = "100%";
  }
}

/**
 * After OSMD paints, size each SVG to its musical content and centre the host.
 * Avoids full-bleed empty SVG canvases that make short scores look lost.
 * Uses explicit pixel width (not CSS fit-content) so OSMD's page div cannot
 * collapse the SVG to 0×0 while getBBox still looks engraved.
 */
export function fitOsmdHostToContent(
  host: HTMLElement,
  options?: { cropEmptyPage?: boolean },
): {
  contentWidthPx: number;
  contentHeightPx: number;
} {
  const cropEmptyPage = options?.cropEmptyPage !== false;
  const svgs = [...host.querySelectorAll("svg")] as SVGSVGElement[];
  if (svgs.length === 0) {
    return { contentWidthPx: 0, contentHeightPx: 0 };
  }

  let maxW = 0;
  let totalH = 0;
  for (const svg of svgs) {
    const { w, h } = readSvgContentSize(svg, { cropEmptyPage });
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

  const widthPx = maxW > 0 ? `${Math.ceil(maxW)}px` : "100%";
  host.style.width = widthPx;
  host.style.maxWidth = "100%";
  host.style.marginInline = "auto";
  host.style.height = totalH > 0 ? `${Math.ceil(totalH)}px` : "auto";

  for (const page of host.querySelectorAll<HTMLElement>(
    '[id^="osmdCanvasPage"]',
  )) {
    page.style.width = widthPx;
    page.style.maxWidth = "100%";
    page.style.height = "auto";
    page.style.marginInline = "auto";
  }

  return { contentWidthPx: maxW, contentHeightPx: totalH };
}

/**
 * Enlarge engraved SVG display size without re-running OSMD (no system reflow).
 * Shared by import-preview and workspace short Continuous scores.
 */
function scaleOsmdHostDisplay(
  host: HTMLElement,
  metrics: { contentWidthPx: number; contentHeightPx: number },
  scale: number,
): { contentWidthPx: number; contentHeightPx: number } {
  const contentW = metrics.contentWidthPx;
  const contentH = metrics.contentHeightPx;
  const targetW = contentW * scale;
  const targetH = contentH * scale;
  const widthPx = `${Math.ceil(targetW)}px`;
  const heightPx = `${Math.ceil(targetH)}px`;

  for (const svg of host.querySelectorAll("svg") as NodeListOf<SVGSVGElement>) {
    svg.setAttribute("width", String(targetW));
    svg.setAttribute("height", String(targetH));
    svg.style.width = widthPx;
    svg.style.height = heightPx;
    svg.style.maxWidth = "100%";
    svg.style.display = "block";
    svg.style.marginInline = "auto";
  }

  host.style.width = widthPx;
  host.style.maxWidth = "100%";
  host.style.height = heightPx;
  host.style.marginInline = "auto";

  for (const page of host.querySelectorAll<HTMLElement>(
    '[id^="osmdCanvasPage"]',
  )) {
    page.style.width = widthPx;
    page.style.maxWidth = "100%";
    page.style.height = "auto";
    page.style.marginInline = "auto";
  }

  return { contentWidthPx: targetW, contentHeightPx: targetH };
}

/**
 * Import review: enlarge the engraved SVG for playable reading while keeping
 * one-line short scores intact (do not re-zoom OSMD here).
 */
export function scaleOsmdHostToImportPreview(
  host: HTMLElement,
  viewportWidthPx: number,
  viewportHeightPx: number,
  metrics: { contentWidthPx: number; contentHeightPx: number },
): { contentWidthPx: number; contentHeightPx: number } {
  const contentW = metrics.contentWidthPx;
  const contentH = metrics.contentHeightPx;
  if (contentW < 8 || contentH < 8) return metrics;

  const wideLine = contentW / contentH >= 3.2;
  // Playable target: staff roughly reading-size; width-first for one-liners.
  const maxW = Math.max(1, viewportWidthPx * (wideLine ? 0.96 : 0.88));
  const maxH = Math.max(
    1,
    viewportHeightPx * (wideLine ? 0.36 : 0.62),
    wideLine ? 168 : 0,
  );
  const scale = Math.min(maxW / contentW, maxH / contentH, 1.85);
  if (scale < 1.03) return metrics;
  return scaleOsmdHostDisplay(host, metrics, scale);
}

/**
 * Workspace Continuous: grow short / medium scores to a healthy reading size.
 * Scales display only (no OSMD reflow) so few-note pieces don’t look tiny,
 * while multi-system scores stay within a readable share of the stage.
 */
export function scaleOsmdHostToWorkspaceReading(
  host: HTMLElement,
  viewportWidthPx: number,
  viewportHeightPx: number,
  metrics: {
    contentWidthPx: number;
    contentHeightPx: number;
    systemCount: number;
  },
): { contentWidthPx: number; contentHeightPx: number } {
  const contentW = metrics.contentWidthPx;
  const contentH = metrics.contentHeightPx;
  if (contentW < 8 || contentH < 8) return metrics;
  // Long scores already fill the stage via scroll — don’t balloon them.
  if (metrics.systemCount > 3) return metrics;

  const vw = Math.max(1, viewportWidthPx);
  const vh = Math.max(1, viewportHeightPx);
  const wideLine = contentW / contentH >= 3.0;
  const systems = Math.max(1, metrics.systemCount);

  // Fewer systems → claim more stage width / a taller staff presence.
  const widthShare =
    systems <= 1 ? (wideLine ? 0.94 : 0.9) : systems === 2 ? 0.88 : 0.84;
  const heightShare =
    systems <= 1 ? (wideLine ? 0.32 : 0.4) : systems === 2 ? 0.5 : 0.58;
  const minStaffPx = systems <= 1 ? (wideLine ? 210 : 240) : 0;
  const maxScale = systems <= 1 ? 2.15 : systems === 2 ? 1.75 : 1.45;

  const maxW = vw * widthShare;
  const maxH = Math.max(1, vh * heightShare, minStaffPx);
  const scale = Math.min(maxW / contentW, maxH / contentH, maxScale);
  if (scale < 1.04) return metrics;
  return scaleOsmdHostDisplay(host, metrics, scale);
}

/**
 * Import review: crop empty page margins so the staff block can sit centred
 * in the card (Endless often leaves a wide blank on the right).
 */
export function centerCropOsmdHostToMusic(host: HTMLElement): {
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
    const attrW = Number(svg.getAttribute("width")) || 0;
    const attrH = Number(svg.getAttribute("height")) || 0;
    let w = attrW;
    let h = attrH;
    try {
      const bbox = svg.getBBox();
      if (bbox.width >= 40 && bbox.height >= 24) {
        const padX = Math.max(18, bbox.width * 0.04);
        const padY = Math.max(22, bbox.height * 0.2);
        const x = Math.max(0, bbox.x - padX);
        const y = Math.max(0, bbox.y - padY);
        w = bbox.width + padX * 2;
        h = bbox.height + padY * 2;
        if (attrW > 0) w = Math.min(w, Math.max(40, attrW - x));
        if (attrH > 0) {
          h = Math.min(Math.max(h, bbox.height + padY * 2), attrH - y);
          // Keep enough vertical room for tempo / articulation above the staff.
          h = Math.max(h, Math.min(attrH * 0.72, bbox.height + padY * 2.4));
        }
        svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
      }
    } catch {
      /* keep attribute size */
    }
    if (w > 0) {
      svg.setAttribute("width", String(w));
      svg.setAttribute("height", String(h));
    }
    svg.style.width = w > 0 ? `${Math.ceil(w)}px` : "auto";
    svg.style.height = h > 0 ? `${Math.ceil(h)}px` : "auto";
    svg.style.maxWidth = "100%";
    svg.style.display = "block";
    svg.style.marginInline = "auto";
    maxW = Math.max(maxW, w);
    totalH += h;
  }

  const widthPx = maxW > 0 ? `${Math.ceil(maxW)}px` : "100%";
  host.style.width = widthPx;
  host.style.maxWidth = "100%";
  host.style.marginInline = "auto";
  host.style.height = totalH > 0 ? `${Math.ceil(totalH)}px` : "auto";

  for (const page of host.querySelectorAll<HTMLElement>(
    '[id^="osmdCanvasPage"]',
  )) {
    page.style.width = widthPx;
    page.style.maxWidth = "100%";
    page.style.height = "auto";
    page.style.marginInline = "auto";
  }

  return { contentWidthPx: maxW, contentHeightPx: totalH };
}

/** Climb OSMD zoom while a short import stays on one system (readable notes). */
export const IMPORT_PREVIEW_SINGLE_SYSTEM_ZOOM_STEPS = [
  1.0, 1.05, 1.08, 1.12, 1.15, 1.18,
] as const;

export function nextImportPreviewSingleSystemZoom(
  currentZoom: number,
): number | null {
  for (const step of IMPORT_PREVIEW_SINGLE_SYSTEM_ZOOM_STEPS) {
    if (step > currentZoom + 0.001) return step;
  }
  return null;
}

/** Soft page margins so Continuous/Page music sits closer to the stage edges. */
export type PieceOsmdMarginRules = {
  PageLeftMargin?: number;
  PageRightMargin?: number;
  PageTopMargin?: number;
  PageBottomMargin?: number;
  PageTopMarginNarrow?: number;
  StretchLastSystemLine?: boolean;
};

export function applyPieceOsmdPageMargins(
  rules: PieceOsmdMarginRules | null | undefined,
  mode: PieceScoreViewMode,
  purpose: ScorePaintOptions["purpose"] = "workspace",
): void {
  if (!rules) return;
  if (purpose === "import-preview" && mode === "continuous") {
    // Keep OSMD default Page*Margin (~5). Smaller values shrink Endless staff
    // height dramatically. Card CSS padding supplies visual inset instead.
    rules.StretchLastSystemLine = false;
    return;
  }
  if (mode === "continuous") {
    rules.PageLeftMargin = 0.25;
    rules.PageRightMargin = 0.25;
    rules.PageTopMargin = 0.18;
    rules.PageBottomMargin = 0.28;
    rules.PageTopMarginNarrow = 0.14;
    rules.StretchLastSystemLine = false;
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
