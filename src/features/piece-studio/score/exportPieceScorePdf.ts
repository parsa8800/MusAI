/**
 * Build a real PDF of the engraved Piece Studio score and open or download it.
 * Never calls window.print() — the user prints only from the PDF viewer if they want.
 *
 * Continuous on-screen engraving is one tall strip; we scale it to A4 width and
 * slice it into normal page-height sheets (not one tiny column on a single page).
 */

export type PieceScorePdfResult =
  | { ok: true; mode: "view" | "download" }
  | { ok: false; reason: "no_score" | "failed" | "popup_blocked" };

export type PieceScorePdfAction = "view" | "download";

function safeFileStem(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[^\w\s-]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 48);
  return cleaned || "score";
}

function collectScoreSvgs(root?: ParentNode | null): SVGSVGElement[] {
  const scope = root ?? (typeof document !== "undefined" ? document : null);
  if (!scope) return [];
  const host = scope.querySelector('[data-testid="piece-osmd"]');
  if (!host) return [];
  // Include page-mode SVGs that are `display:none` — use intrinsic size, not
  // getBoundingClientRect (hidden nodes report 0×0).
  return [...host.querySelectorAll("svg")].filter((svg) => {
    const { width, height } = svgNaturalSize(svg as SVGSVGElement);
    return width >= 40 && height >= 24;
  }) as SVGSVGElement[];
}

function svgNaturalSize(svg: SVGSVGElement): { width: number; height: number } {
  const viewBox = svg.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (
      parts.length === 4 &&
      parts.every((n) => Number.isFinite(n)) &&
      parts[2]! > 0 &&
      parts[3]! > 0
    ) {
      return { width: parts[2]!, height: parts[3]! };
    }
  }
  const attrW = Number.parseFloat(svg.getAttribute("width") || "");
  const attrH = Number.parseFloat(svg.getAttribute("height") || "");
  if (attrW > 0 && attrH > 0) return { width: attrW, height: attrH };

  const box = svg.getBoundingClientRect?.();
  if (box && box.width > 0 && box.height > 0) {
    return { width: box.width, height: box.height };
  }
  return { width: 800, height: 1100 };
}

function isLightCssColor(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v === "white" || v === "#fff" || v === "#ffffff") return true;
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const r = Number.parseInt(h.slice(0, 2), 16);
    const g = Number.parseInt(h.slice(2, 4), 16);
    const b = Number.parseInt(h.slice(4, 6), 16);
    return (r + g + b) / 3 > 200;
  }
  const rgb = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    return (+rgb[1]! + +rgb[2]! + +rgb[3]!) / 3 > 200;
  }
  return false;
}

/** Dark-theme engraving uses light strokes — flip them for white paper. */
function forcePrintInk(svg: SVGSVGElement) {
  for (const node of svg.querySelectorAll("*")) {
    const el = node as Element;
    for (const attr of ["stroke", "fill"] as const) {
      const value = el.getAttribute(attr);
      if (!value || value === "none" || value === "transparent") continue;
      if (value === "currentColor" || isLightCssColor(value)) {
        el.setAttribute(attr, "#111111");
      }
    }
    const style = el.getAttribute("style");
    if (!style) continue;
    const next = style.replace(
      /(stroke|fill)\s*:\s*([^;]+)/gi,
      (match, prop: string, raw: string) => {
        const value = raw.trim();
        if (value === "none" || value === "transparent") return match;
        if (value === "currentColor" || isLightCssColor(value)) {
          return `${prop}:#111111`;
        }
        return match;
      },
    );
    if (next !== style) el.setAttribute("style", next);
  }
}

function cloneScoreSvg(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
  const { width, height } = svgNaturalSize(svg);
  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  forcePrintInk(clone);
  clone.setAttribute(
    "style",
    "color:#111111;background:#ffffff;width:100%;height:auto;",
  );
  return clone;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to rasterize score SVG"));
    img.src = url;
  });
}

async function svgToPng(
  svg: SVGSVGElement,
  scale = 2,
): Promise<{
  dataUrl: string;
  width: number;
  height: number;
  systems: ScoreSystemSpan[];
}> {
  const clone = cloneScoreSvg(svg);
  const { width, height } = svgNaturalSize(clone);
  const markup = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await loadImage(objectUrl);
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let systems: ScoreSystemSpan[] = [];
    if (typeof ctx.getImageData === "function") {
      try {
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        systems = systemsFromRgba(image.data, canvas.width, canvas.height, h);
      } catch {
        systems = [];
      }
    }
    return {
      dataUrl: canvas.toDataURL("image/png"),
      width: w,
      height: h,
      systems,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** One engraved system in the score raster, top to bottom, logical pixels. */
export type ScoreSystemSpan = { top: number; bottom: number };

type InkRun = { top: number; bottom: number };

/**
 * Split within-staff gaps (staff lines, ledger notes) from the larger gap
 * between systems. Returns the largest gap that still belongs to one system.
 */
export function systemGapThreshold(
  gaps: readonly number[],
  runHeights: readonly number[] = [],
): number {
  if (gaps.length === 0) return Number.POSITIVE_INFINITY;
  const sorted = [...gaps].sort((a, b) => a - b);
  let bestJump = 0;
  let cut = sorted[sorted.length - 1]! + 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]!;
    const next = sorted[i]!;
    const jump = next - prev;
    if (jump > bestJump && next > prev * 1.6 && jump >= 4) {
      bestJump = jump;
      cut = (prev + next) / 2;
    }
  }
  if (bestJump > 0) return cut;

  const medianGap = sorted[Math.floor(sorted.length / 2)]!;
  const heights = [...runHeights].sort((a, b) => a - b);
  const medianRun =
    heights.length > 0 ? heights[Math.floor(heights.length / 2)]! : 0;
  // Each ink block is already a full system (as tall as the gap beside it).
  if (medianRun >= medianGap * 0.8) return 0;
  return medianGap * 2.5 + 1;
}

function mergeInkRuns(runs: readonly InkRun[]): InkRun[] {
  if (runs.length <= 1) return runs.map((run) => ({ ...run }));
  const gaps: number[] = [];
  const heights: number[] = [];
  for (let i = 0; i < runs.length; i += 1) {
    heights.push(runs[i]!.bottom - runs[i]!.top + 1);
    if (i > 0) gaps.push(runs[i]!.top - runs[i - 1]!.bottom);
  }
  const threshold = systemGapThreshold(gaps, heights);
  const out: InkRun[] = [{ ...runs[0]! }];
  for (let i = 1; i < runs.length; i += 1) {
    const run = runs[i]!;
    const prev = out[out.length - 1]!;
    if (run.top - prev.bottom < threshold) prev.bottom = run.bottom;
    else out.push({ ...run });
  }
  return out;
}

/**
 * Group dark pixels into systems. Logical `top`/`bottom` match the score
 * raster used for paging, so a page break can sit in the white gap.
 */
export function systemsFromRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  logicalHeight: number,
): ScoreSystemSpan[] {
  if (width < 8 || height < 8 || !(logicalHeight > 0) || data.length < width * height * 4) {
    return [];
  }
  const x0 = Math.floor(width * 0.06);
  const x1 = Math.max(x0 + 1, Math.ceil(width * 0.94));
  const step = Math.max(1, Math.floor((x1 - x0) / 48));
  const runs: InkRun[] = [];
  let start = -1;
  for (let y = 0; y < height; y += 1) {
    let ink = false;
    for (let x = x0; x < x1; x += step) {
      const i = (y * width + x) * 4;
      if (data[i]! < 250 || data[i + 1]! < 250 || data[i + 2]! < 250) {
        ink = true;
        break;
      }
    }
    if (ink) {
      if (start < 0) start = y;
    } else if (start >= 0) {
      runs.push({ top: start, bottom: y - 1 });
      start = -1;
    }
  }
  if (start >= 0) runs.push({ top: start, bottom: height - 1 });

  const pxPerLogical = height / logicalHeight;
  return mergeInkRuns(runs).map((run) => ({
    top: run.top / pxPerLogical,
    bottom: (run.bottom + 1) / pxPerLogical,
  }));
}

/**
 * End this page in the white gap after the last system that fully fits.
 * Never slice through a staff. A system taller than the page is cut as a fallback.
 */
export function chooseSliceEnd(
  yStart: number,
  maxEnd: number,
  totalHeight: number,
  systems: readonly ScoreSystemSpan[],
): number {
  const hard = Math.min(totalHeight, Math.max(yStart + 1, maxEnd));
  if (!(totalHeight > yStart) || systems.length === 0) return hard;

  const fitting = systems.filter(
    (system) =>
      system.bottom > yStart + 0.5 &&
      system.top >= yStart - 0.5 &&
      system.bottom <= maxEnd + 0.25,
  );
  if (fitting.length === 0) {
    const upcoming = systems.find((system) => system.bottom > yStart + 0.5);
    if (upcoming && upcoming.top > yStart + 4 && upcoming.top <= maxEnd) {
      return Math.min(hard, upcoming.top);
    }
    return hard;
  }

  const last = fitting[fitting.length - 1]!;
  const next = systems.find((system) => system.top >= last.bottom - 0.25);
  if (!next) return totalHeight;
  const gapMid = (last.bottom + next.top) / 2;
  if (gapMid <= maxEnd + 0.25 && gapMid > yStart + 0.5) {
    return Math.min(totalHeight, gapMid);
  }
  if (last.bottom > yStart + 0.5 && last.bottom <= maxEnd + 0.25) {
    const padded = Math.min(maxEnd, next.top - 0.5, last.bottom + 2);
    return Math.min(totalHeight, Math.max(last.bottom, padded));
  }
  return hard;
}

/**
 * Scale a score raster to full printable width, then cut it into page-tall
 * slices so long continuous engraving becomes a normal multi-page PDF.
 * `systems` keeps each slice from cutting through a staff.
 */
export async function sliceScorePngToPages(
  png: { dataUrl: string; width: number; height: number },
  pageContentW: number,
  maxPageContentH: number,
  systems: readonly ScoreSystemSpan[] = [],
): Promise<{ dataUrl: string; width: number; height: number }[]> {
  if (!(png.width > 0) || !(png.height > 0)) return [];
  const img = await loadImage(png.dataUrl);
  const widthScale = pageContentW / png.width;
  const maxSliceLogicalH = Math.max(1, maxPageContentH / widthScale);
  const imgPxPerLogical = img.naturalWidth / png.width || 1;

  const pages: { dataUrl: string; width: number; height: number }[] = [];
  let yLogical = 0;
  while (yLogical < png.height - 0.5) {
    const maxEnd = Math.min(png.height, yLogical + maxSliceLogicalH);
    let sliceEnd = chooseSliceEnd(yLogical, maxEnd, png.height, systems);
    if (sliceEnd <= yLogical + 0.5) sliceEnd = maxEnd;
    const sliceLogicalH = sliceEnd - yLogical;
    const drawH = sliceLogicalH * widthScale;
    const pixelScale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(pageContentW * pixelScale));
    canvas.height = Math.max(1, Math.round(drawH * pixelScale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      img,
      0,
      yLogical * imgPxPerLogical,
      png.width * imgPxPerLogical,
      sliceLogicalH * imgPxPerLogical,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    pages.push({
      dataUrl: canvas.toDataURL("image/png"),
      width: pageContentW,
      height: drawH,
    });
    yLogical = sliceEnd;
  }
  return pages;
}

/**
 * Build a multi-page A4 PDF blob of the engraved score.
 */
export async function buildPieceScorePdfBlob(options: {
  title: string;
  root?: ParentNode | null;
}): Promise<{ blob: Blob; fileName: string } | null> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }
  const svgs = collectScoreSvgs(options.root);
  if (svgs.length === 0) return null;

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
    compress: true,
  });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;
  const title = options.title.trim() || "Score";
  const contentW = pageW - margin * 2;
  const titleBlockH = 28;
  const bodyH = pageH - margin * 2;
  const firstBodyH = Math.max(120, bodyH - titleBlockH);

  let pageCount = 0;
  for (const svg of svgs) {
    const png = await svgToPng(svg, 2);
    const img = await loadImage(png.dataUrl);
    const widthScale = contentW / png.width;
    const imgPxPerLogical = img.naturalWidth / png.width || 1;
    const systems = png.systems;

    let yLogical = 0;
    while (yLogical < png.height - 0.5) {
      const isFirstDocPage = pageCount === 0;
      const maxDrawH = isFirstDocPage ? firstBodyH : bodyH;
      const maxSliceLogicalH = Math.max(1, maxDrawH / widthScale);
      const maxEnd = Math.min(png.height, yLogical + maxSliceLogicalH);
      let sliceEnd = chooseSliceEnd(yLogical, maxEnd, png.height, systems);
      if (sliceEnd <= yLogical + 0.5) sliceEnd = maxEnd;
      const sliceLogicalH = sliceEnd - yLogical;
      const drawH = sliceLogicalH * widthScale;

      const pixelScale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(contentW * pixelScale));
      canvas.height = Math.max(1, Math.round(drawH * pixelScale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        img,
        0,
        yLogical * imgPxPerLogical,
        png.width * imgPxPerLogical,
        sliceLogicalH * imgPxPerLogical,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const dataUrl = canvas.toDataURL("image/png");

      if (pageCount > 0) doc.addPage();
      pageCount += 1;

      let cursorY = margin;
      if (pageCount === 1) {
        doc.setFont("times", "bold");
        doc.setFontSize(16);
        doc.setTextColor(17, 17, 17);
        doc.text(title, pageW / 2, cursorY + 12, { align: "center" });
        cursorY += titleBlockH;
      }

      doc.addImage(
        dataUrl,
        "PNG",
        margin,
        cursorY,
        contentW,
        drawH,
        undefined,
        "FAST",
      );
      yLogical = sliceEnd;
    }
  }

  if (pageCount === 0) return null;

  const blob = doc.output("blob");
  return {
    blob,
    fileName: `${safeFileStem(title)}.pdf`,
  };
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Open the generated PDF in a new tab (browser PDF viewer).
 * Falls back to download if the popup is blocked.
 * Does not open the print dialog.
 */
export async function openPieceScorePdf(options: {
  title: string;
  root?: ParentNode | null;
}): Promise<PieceScorePdfResult> {
  try {
    const built = await buildPieceScorePdfBlob(options);
    if (!built) return { ok: false, reason: "no_score" };

    const url = URL.createObjectURL(built.blob);
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
      triggerDownload(built.blob, built.fileName);
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      return { ok: true, mode: "download" };
    }
    // Keep the blob URL alive while the tab loads; revoke later.
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return { ok: true, mode: "view" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/**
 * Download the generated PDF file without printing.
 */
export async function downloadPieceScorePdf(options: {
  title: string;
  root?: ParentNode | null;
}): Promise<PieceScorePdfResult> {
  try {
    const built = await buildPieceScorePdfBlob(options);
    if (!built) return { ok: false, reason: "no_score" };
    triggerDownload(built.blob, built.fileName);
    return { ok: true, mode: "download" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/**
 * @deprecated Use openPieceScorePdf — kept so older imports keep working.
 * Opens the PDF viewer; never auto-prints.
 */
export async function savePieceScoreAsPdf(options: {
  title: string;
  root?: ParentNode | null;
}): Promise<PieceScorePdfResult> {
  return openPieceScorePdf(options);
}

/** Test helper — collect engraved SVG count without exporting. */
export function countPieceScoreSvgs(root?: ParentNode | null): number {
  return collectScoreSvgs(root).length;
}
