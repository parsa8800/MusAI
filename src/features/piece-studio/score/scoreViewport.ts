/**
 * OSMD engraves against container width. Painting into a 0-width host produces
 * blank scores (SkyBottomLineCalculator: width not > 0). Wait for layout first.
 */

export const MIN_SCORE_VIEWPORT_WIDTH_PX = 48;
/** Flex stages can report width before height settles — both must be usable. */
export const MIN_SCORE_VIEWPORT_HEIGHT_PX = 32;

export function readScoreViewportSize(el: HTMLElement | null): {
  width: number;
  height: number;
} {
  if (!el) return { width: 0, height: 0 };
  const rect = el.getBoundingClientRect();
  return {
    width: el.clientWidth || rect.width || 0,
    height: el.clientHeight || rect.height || 0,
  };
}

export function canPaintScoreViewport(
  widthPx: number,
  heightPx: number = Number.POSITIVE_INFINITY,
): boolean {
  return (
    widthPx >= MIN_SCORE_VIEWPORT_WIDTH_PX &&
    heightPx >= MIN_SCORE_VIEWPORT_HEIGHT_PX
  );
}

function viewportReady(
  size: { width: number; height: number },
  minWidth: number,
  minHeight: number,
): boolean {
  return size.width >= minWidth && size.height >= minHeight;
}

/**
 * Resolve when `el` has a usable width and height, or after a short settle budget.
 * Prefer ResizeObserver; also sample animation frames for display switches.
 */
export function waitForScoreViewport(
  el: HTMLElement,
  options?: {
    minWidthPx?: number;
    minHeightPx?: number;
    maxFrames?: number;
    isCancelled?: () => boolean;
  },
): Promise<{ width: number; height: number }> {
  const minWidth = options?.minWidthPx ?? MIN_SCORE_VIEWPORT_WIDTH_PX;
  const minHeight = options?.minHeightPx ?? MIN_SCORE_VIEWPORT_HEIGHT_PX;
  const maxFrames = options?.maxFrames ?? 90;
  const isCancelled = options?.isCancelled;

  return new Promise((resolve) => {
    let settled = false;
    let frames = 0;
    let raf = 0;
    let ro: ResizeObserver | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
      resolve(readScoreViewportSize(el));
    };

    const sample = () => {
      if (isCancelled?.()) {
        finish();
        return;
      }
      const size = readScoreViewportSize(el);
      if (viewportReady(size, minWidth, minHeight)) {
        finish();
        return;
      }
      frames += 1;
      if (frames >= maxFrames) {
        finish();
        return;
      }
      raf = requestAnimationFrame(sample);
    };

    const first = readScoreViewportSize(el);
    if (viewportReady(first, minWidth, minHeight)) {
      resolve(first);
      return;
    }

    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        const size = readScoreViewportSize(el);
        if (viewportReady(size, minWidth, minHeight)) finish();
      });
      ro.observe(el);
    }
    raf = requestAnimationFrame(sample);
  });
}

/** Dev-only stage logs for the MusicXML → preview path. */
export function musicXmlPreviewLog(
  stage:
    | "MUSICXML_SELECTED"
    | "MUSICXML_READ"
    | "MUSICXML_VALID"
    | "MUSICXML_PARSED"
    | "SCORE_NORMALISED"
    | "PREVIEW_RENDER_START"
    | "PREVIEW_RENDER_SUCCESS"
    | "PREVIEW_RENDER_FAIL",
  detail?: Record<string, unknown>,
): void {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
    return;
  }
  const line = `[${stage}]`;
  if (stage === "PREVIEW_RENDER_FAIL") {
    // Soft layout retries are expected while the stage settles — don't surface
    // them as Next.js console-error overlays.
    if (detail && detail.softFail != null) {
      console.info(line, detail);
      return;
    }
    console.error(line, detail ?? {});
    return;
  }
  console.info(line, detail ?? {});
}
