"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createDefaultScoreRenderer } from "@/features/piece-studio/score/createDefaultScoreRenderer";
import { overlayRectsForRange } from "@/features/piece-studio/score/scoreOverlayGeometry";
import {
  interpolateCursorBand,
  pickCursorTime,
  type CursorBand,
  type CursorPose,
} from "@/features/piece-studio/score/cursorTrack";
import type { PiecePlaybackTimeListener } from "@/features/piece-studio/playback/playbackTime";
import {
  readPieceOsmdTheme,
  type PieceOsmdTheme,
} from "@/features/piece-studio/score/osmdTheme";
import type { ScoreRenderer } from "@/features/piece-studio/score/ScoreRenderer";
import { musicXmlRenderSource } from "@/features/piece-studio/score/scoreRenderSource";
import {
  classifyScoreScrollDensity,
  clampScorePageIndex,
  shouldOfferScoreViewModes,
  type PieceScoreViewMode,
  type ScoreLayoutMetrics,
  type ScoreScrollDensity,
} from "@/features/piece-studio/score/scorePresentation";
import {
  canPaintScoreViewport,
  musicXmlPreviewLog,
  waitForScoreViewport,
} from "@/features/piece-studio/score/scoreViewport";
import { tapFeedback } from "@/lib/motion";

export type PieceScoreHighlight = {
  id: string;
  startWholeNotes: number;
  endWholeNotes: number;
  /** Accessible name only — never drawn as a label on the score. */
  label: string;
  source?: "analysis" | "mock-preview";
  visualTone?: "pitch" | "rhythm" | "rushing" | "dragging" | "dynamics" | null;
  visualStyle?: "note" | "measure" | "heat" | null;
};

/** Import review / gated preview — parent enables confirm only after `ready`. */
export type ScorePaintState = "preparing" | "ready" | "failed";

function hostHasEngravedSvg(host: HTMLElement | null): boolean {
  return Boolean(host?.querySelector("svg"));
}

function metricsLookEngraved(metrics: ScoreLayoutMetrics): boolean {
  return metrics.contentWidthPx > 0 && metrics.contentHeightPx > 0;
}

function shapeOverlayRect(
  rect: { x: number; y: number; width: number; height: number },
  style: PieceScoreHighlight["visualStyle"],
) {
  if (style === "note") {
    const width = Math.min(36, Math.max(22, rect.width * 0.42));
    return {
      ...rect,
      x: rect.x + Math.max(0, (rect.width - width) * 0.35),
      width,
      height: Math.max(rect.height, 34),
    };
  }
  if (style === "measure") {
    return {
      ...rect,
      y: rect.y - 4,
      height: rect.height + 10,
    };
  }
  return rect;
}

const VIEW_MODE_OPTIONS: { value: PieceScoreViewMode; label: string }[] = [
  { value: "continuous", label: "Continuous" },
  { value: "page", label: "Page" },
  { value: "overview", label: "Overview" },
];

/**
 * React shell over ScoreRenderer.
 * Consumes MusicXML interchange for engraving; playback timing stays on MusaiScoreV1.
 * Does not import OpenSheetMusicDisplay directly.
 */
export function OsmdScoreAdapter({
  musicXml,
  title,
  followPlayback = false,
  subscribePlaybackTime,
  getPlaybackTime,
  wholeNotesToSeconds,
  onSeek,
  highlight = null,
  onHighlightSelect,
  onPaintState,
  showInlineError = true,
}: {
  musicXml: string;
  title: string;
  followPlayback?: boolean;
  subscribePlaybackTime?: (listener: PiecePlaybackTimeListener) => () => void;
  getPlaybackTime?: () => number;
  wholeNotesToSeconds?: (wholeNotes: number) => number;
  onSeek?: (tSec: number) => void;
  /** One focused overlay at a time. Listen playback hides it. */
  highlight?: PieceScoreHighlight | null;
  onHighlightSelect?: (id: string) => void;
  /** Fires preparing → ready | failed. Import review gates confirm on `ready`. */
  onPaintState?: (state: ScorePaintState) => void;
  /** When false, parent owns the failure UI (no inline error card). */
  showInlineError?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const bandRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const rendererRef = useRef<ScoreRenderer | null>(null);
  const snapsRef = useRef<CursorPose[]>([]);
  const convertRef = useRef(wholeNotesToSeconds);
  convertRef.current = wholeNotesToSeconds;
  const onPaintStateRef = useRef(onPaintState);
  onPaintStateRef.current = onPaintState;
  const themeRef = useRef<PieceOsmdTheme>(readPieceOsmdTheme());
  const viewModeRef = useRef<PieceScoreViewMode>("continuous");
  const engravedModeRef = useRef<PieceScoreViewMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snapVersion, setSnapVersion] = useState(0);
  const [viewMode, setViewMode] = useState<PieceScoreViewMode>("continuous");
  const [pageIndex, setPageIndex] = useState(0);
  const [metrics, setMetrics] = useState<ScoreLayoutMetrics | null>(null);
  const [density, setDensity] = useState<ScoreScrollDensity>("compact");
  const [viewportHeight, setViewportHeight] = useState(0);
  const lastScrollY = useRef<number | null>(null);
  viewModeRef.current = followPlayback ? "continuous" : viewMode;

  const heatRects = useMemo(() => {
    if (followPlayback || !highlight) return [];
    const convert =
      convertRef.current ?? ((wn: number) => wn * 4 * (60 / 100));
    return overlayRectsForRange(
      snapsRef.current,
      convert(highlight.startWholeNotes),
      convert(highlight.endWholeNotes),
    );
    // snapVersion refreshes after layout; highlight identity drives overlays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    followPlayback,
    highlight?.id,
    highlight?.startWholeNotes,
    highlight?.endWholeNotes,
    snapVersion,
  ]);

  const takeSnapshots = () => {
    const renderer = rendererRef.current;
    const wrap = wrapRef.current;
    if (!renderer || !wrap) return;
    const convert = convertRef.current ?? ((wn: number) => wn * 4 * (60 / 100));
    try {
      snapsRef.current = renderer.collectCursorSnapshots(wrap, convert);
    } catch {
      snapsRef.current = [];
    }
    setSnapVersion((n) => n + 1);
  };

  useEffect(() => {
    const host = hostRef.current;
    const wrap = wrapRef.current;
    if (!host || !wrap) return;
    let cancelled = false;
    let renderer: ScoreRenderer | null = null;
    let resizeTimer: number | null = null;
    let idleHandle: number | null = null;
    let lastPaintWidth = 0;

    const snapshot = () => {
      if (cancelled || !renderer) return;
      rendererRef.current = renderer;
      takeSnapshots();
    };

    const scheduleSnapshot = () => {
      if (cancelled) return;
      if (idleHandle != null) {
        if (typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(idleHandle);
        } else {
          window.clearTimeout(idleHandle);
        }
        idleHandle = null;
      }
      const runSnap = () => {
        idleHandle = null;
        snapshot();
      };
      if (typeof window.requestIdleCallback === "function") {
        idleHandle = window.requestIdleCallback(runSnap, { timeout: 320 });
      } else {
        idleHandle = window.setTimeout(runSnap, 0);
      }
    };

    const reportPaint = (state: ScorePaintState) => {
      if (cancelled) return;
      onPaintStateRef.current?.(state);
    };

    const failPaint = (detail: string) => {
      musicXmlPreviewLog("PREVIEW_RENDER_FAIL", { message: detail });
      if (!cancelled) {
        setError("Couldn’t display this score");
        reportPaint("failed");
      }
    };

    const paint = (opts?: { force?: boolean }) => {
      if (!renderer || cancelled) return false;
      const width = wrap.clientWidth || wrap.getBoundingClientRect().width || 0;
      const height =
        wrap.clientHeight || wrap.getBoundingClientRect().height || 0;
      // Never engrave into a zero-width host — OSMD leaves a blank score.
      if (!canPaintScoreViewport(width)) {
        if (process.env.NODE_ENV !== "production") {
          console.info("[PREVIEW_RENDER_START] waiting for layout width", {
            width,
            height,
            force: Boolean(opts?.force),
          });
        }
        return false;
      }
      if (
        !opts?.force &&
        lastPaintWidth > 0 &&
        Math.abs(width - lastPaintWidth) < 24
      ) {
        return false;
      }
      try {
        musicXmlPreviewLog("PREVIEW_RENDER_START", {
          width,
          height,
          xmlChars: musicXml.length,
          force: Boolean(opts?.force),
        });
        const nextMetrics = renderer.paint(themeRef.current, {
          viewMode: viewModeRef.current,
          viewportWidthPx: width,
          viewportHeightPx: height,
        });
        if (!cancelled) {
          engravedModeRef.current = viewModeRef.current;
          setMetrics(nextMetrics);
          setViewportHeight(height);
          setDensity(
            classifyScoreScrollDensity(nextMetrics, height || width),
          );
          if (viewModeRef.current === "page") {
            setPageIndex(0);
            renderer.setVisiblePage?.(0);
          }
          if (
            metricsLookEngraved(nextMetrics) &&
            hostHasEngravedSvg(host)
          ) {
            lastPaintWidth = width;
            musicXmlPreviewLog("PREVIEW_RENDER_SUCCESS", {
              width,
              pageCount: nextMetrics.pageCount,
              contentWidthPx: nextMetrics.contentWidthPx,
              contentHeightPx: nextMetrics.contentHeightPx,
            });
            setError(null);
            reportPaint("ready");
          } else {
            failPaint("paint produced no engraved score content");
            return false;
          }
        }
        return true;
      } catch (err) {
        musicXmlPreviewLog("PREVIEW_RENDER_FAIL", {
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
        if (!cancelled) {
          setError("Couldn’t display this score");
          reportPaint("failed");
        }
        return false;
      }
    };

    const run = async () => {
      setError(null);
      reportPaint("preparing");
      try {
        renderer = createDefaultScoreRenderer();
        await renderer.mount(host);
        if (cancelled) {
          renderer.dispose();
          return;
        }
        themeRef.current = readPieceOsmdTheme();
        rendererRef.current = renderer;
        await renderer.load(musicXmlRenderSource(musicXml));
        if (cancelled) {
          renderer.dispose();
          return;
        }
        const layout = await waitForScoreViewport(wrap, {
          isCancelled: () => cancelled,
        });
        if (cancelled) {
          renderer.dispose();
          return;
        }
        if (!canPaintScoreViewport(layout.width)) {
          // One more frame after CSS flex settle (import review remount).
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          if (cancelled) {
            renderer.dispose();
            return;
          }
        }
        const painted = paint({ force: true });
        if (!painted && !cancelled) {
          // ResizeObserver will retry; keep a visible status if still empty.
          window.requestAnimationFrame(() => {
            if (cancelled) return;
            if (!paint({ force: true }) && lastPaintWidth < 1) {
              failPaint("viewport width still zero after layout wait");
            } else if (lastPaintWidth > 0) {
              scheduleSnapshot();
            }
          });
          return;
        }
        window.requestAnimationFrame(() => {
          if (cancelled) return;
          paint();
          scheduleSnapshot();
        });
      } catch (err) {
        musicXmlPreviewLog("PREVIEW_RENDER_FAIL", {
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
        if (!cancelled) {
          setError("Couldn’t display this score");
          reportPaint("failed");
        }
      }
    };

    const onResize = () => {
      if (resizeTimer != null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (paint()) scheduleSnapshot();
      }, 140);
    };

    const onThemeMutation = () => {
      const next = readPieceOsmdTheme();
      if (next === themeRef.current) return;
      themeRef.current = next;
      paint({ force: true });
      scheduleSnapshot();
    };

    const themeObserver = new MutationObserver(onThemeMutation);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => onResize())
        : null;
    resizeObserver?.observe(wrap);

    void run();
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      themeObserver.disconnect();
      resizeObserver?.disconnect();
      if (resizeTimer != null) window.clearTimeout(resizeTimer);
      if (idleHandle != null) {
        if (typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(idleHandle);
        } else {
          window.clearTimeout(idleHandle);
        }
      }
      renderer?.dispose();
      rendererRef.current = null;
      snapsRef.current = [];
    };
    // Mode changes re-paint via the dedicated effect below.
  }, [musicXml]);

  // Re-engrave only when the engraved page format actually changes.
  // Score ↔ Listen both use Continuous — skip a full paint on that toggle.
  useEffect(() => {
    const renderer = rendererRef.current;
    const wrap = wrapRef.current;
    if (!renderer || !wrap) return;
    const mode: PieceScoreViewMode = followPlayback ? "continuous" : viewMode;
    if (engravedModeRef.current === mode) {
      if (followPlayback) takeSnapshots();
      return;
    }
    const width = wrap.clientWidth || wrap.getBoundingClientRect().width || 0;
    const height =
      wrap.clientHeight || wrap.getBoundingClientRect().height || 0;
    if (!canPaintScoreViewport(width)) return;
    try {
      const nextMetrics = renderer.paint(themeRef.current, {
        viewMode: mode,
        viewportWidthPx: width,
        viewportHeightPx: height,
      });
      engravedModeRef.current = mode;
      setMetrics(nextMetrics);
      setViewportHeight(height);
      setDensity(classifyScoreScrollDensity(nextMetrics, height || width));
      if (!followPlayback && mode === "page") {
        const page = clampScorePageIndex(pageIndex, nextMetrics.pageCount);
        setPageIndex(page);
        renderer.setVisiblePage?.(page);
      }
      takeSnapshots();
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[piece-osmd] view mode paint failed", err);
      }
    }
    // pageIndex intentionally read for Overview → Page jump; do not re-run on pager alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, followPlayback]);

  useEffect(() => {
    if (viewMode !== "page" || followPlayback) return;
    rendererRef.current?.setVisiblePage?.(pageIndex);
  }, [pageIndex, viewMode, followPlayback]);

  useEffect(() => {
    const el = cursorRef.current;
    const band = bandRef.current;
    const measure = measureRef.current;
    if (!followPlayback) {
      if (el) el.style.visibility = "hidden";
      if (band) band.style.visibility = "hidden";
      if (measure) measure.style.visibility = "hidden";
      lastScrollY.current = null;
      return;
    }
    if (!subscribePlaybackTime) return;

    const applyPose = (next: CursorBand | null) => {
      if (!el || !band) return;
      if (!next) {
        el.style.visibility = "hidden";
        band.style.visibility = "hidden";
        if (measure) measure.style.visibility = "hidden";
        return;
      }
      el.style.visibility = "visible";
      band.style.visibility = "visible";
      el.style.height = `${next.height}px`;
      el.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`;
      band.style.height = `${next.height}px`;
      band.style.width = `${next.width}px`;
      band.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`;
      if (measure) {
        const mw = next.measureWidth ?? next.width * 2.4;
        const mx = next.measureX ?? Math.max(0, next.x - mw * 0.15);
        measure.style.visibility = "visible";
        measure.style.height = `${next.height + 10}px`;
        measure.style.width = `${mw}px`;
        measure.style.transform = `translate3d(${mx}px, ${Math.max(0, next.y - 5)}px, 0)`;
      }

      const wrap = wrapRef.current;
      if (!wrap) return;
      const viewTop = wrap.scrollTop + wrap.clientHeight * 0.14;
      const viewBottom = wrap.scrollTop + wrap.clientHeight * 0.82;
      const cursorMid = next.y + next.height / 2;
      if (cursorMid >= viewTop && cursorMid <= viewBottom) return;
      if (
        lastScrollY.current != null &&
        Math.abs(lastScrollY.current - next.y) < 6
      ) {
        return;
      }
      const top = Math.max(0, next.y - wrap.clientHeight * 0.3);
      lastScrollY.current = next.y;
      wrap.scrollTo({
        top,
        behavior: "auto",
      });
    };

    const onTime = (tSec: number) => {
      applyPose(interpolateCursorBand(snapsRef.current, tSec));
    };

    onTime(getPlaybackTime?.() ?? 0);
    return subscribePlaybackTime(onTime);
  }, [followPlayback, subscribePlaybackTime, getPlaybackTime, snapVersion]);

  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    // Overview: tap a page thumbnail → open that page.
    if (!followPlayback && viewMode === "overview") {
      const host = hostRef.current;
      const target = event.target;
      if (host && target instanceof Element) {
        const svg = target.closest("svg");
        if (svg && host.contains(svg)) {
          const index = [...host.querySelectorAll(":scope > svg")].indexOf(
            svg as SVGSVGElement,
          );
          if (index >= 0) {
            tapFeedback("light");
            setPageIndex(index);
            setViewMode("page");
            return;
          }
        }
      }
    }

    if (!followPlayback || !onSeek || highlight) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const x = event.clientX - rect.left + wrap.scrollLeft;
    const y = event.clientY - rect.top + wrap.scrollTop;
    const t = pickCursorTime(snapsRef.current, x, y);
    if (t != null) onSeek(t);
  };

  const offerModes =
    !followPlayback &&
    metrics != null &&
    shouldOfferScoreViewModes(metrics, viewportHeight || 640);
  const effectiveDensity = followPlayback ? "scroll" : density;
  const activeMode = followPlayback ? "continuous" : viewMode;
  const pageCount = metrics?.pageCount ?? 0;

  const wrapClass = [
    "musai-piece-osmd-wrap",
    followPlayback ? "musai-piece-osmd-wrap--follow" : "",
    `musai-piece-osmd-wrap--${effectiveDensity}`,
    `musai-piece-osmd-wrap--${activeMode}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="musai-piece-score-viewer" data-testid="piece-score-viewer">
      {offerModes ? (
        <div
          className="musai-piece-score-viewer__modes"
          role="tablist"
          aria-label="Score view"
        >
          {VIEW_MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={viewMode === opt.value}
              className={
                viewMode === opt.value
                  ? "musai-piece-score-viewer__mode is-active"
                  : "musai-piece-score-viewer__mode"
              }
              onClick={() => {
                if (opt.value === viewMode) return;
                tapFeedback("light");
                setViewMode(opt.value);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}

      <div ref={wrapRef} className={wrapClass} onClick={onClick}>
        <div
          ref={hostRef}
          className={
            activeMode === "overview"
              ? "musai-piece-osmd musai-piece-osmd--overview"
              : "musai-piece-osmd"
          }
          data-testid="piece-osmd"
          data-theme-ink={themeRef.current}
          data-density={effectiveDensity}
          data-view={activeMode}
          aria-label={`${title} score`}
        />
        {!followPlayback && highlight
          ? heatRects.map((rect, i) => {
              const shaped = shapeOverlayRect(rect, highlight.visualStyle);
              const mock = highlight.source !== "analysis";
              return (
                <button
                  key={`${highlight.id}-${i}`}
                  type="button"
                  className="musai-piece-heat"
                  data-testid="piece-score-heat"
                  data-mock={mock ? "true" : "false"}
                  data-source={highlight.source ?? "mock-preview"}
                  data-tone={highlight.visualTone ?? undefined}
                  data-style={highlight.visualStyle ?? "heat"}
                  aria-label={`${highlight.label} on the score. Ask Parsa about this.`}
                  style={{
                    left: shaped.x,
                    top: shaped.y,
                    width: shaped.width,
                    height: shaped.height,
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onHighlightSelect?.(highlight.id);
                  }}
                >
                  <span className="musai-piece-heat__marker" aria-hidden />
                </button>
              );
            })
          : null}
        <span
          ref={measureRef}
          className="musai-piece-cursor-measure"
          data-testid="piece-score-cursor-measure"
          aria-hidden
          style={{ visibility: "hidden" }}
        />
        <span
          ref={bandRef}
          className="musai-piece-cursor-band"
          data-testid="piece-score-cursor-band"
          aria-hidden
          style={{ visibility: "hidden" }}
        />
        <span
          ref={cursorRef}
          className="musai-piece-cursor"
          data-testid="piece-score-cursor"
          aria-hidden
          style={{ visibility: "hidden" }}
        />
        {showInlineError && error ? (
          <p className="musai-piece-osmd-error" role="status">
            {error}
          </p>
        ) : null}
      </div>

      {!followPlayback && viewMode === "page" && pageCount > 1 ? (
        <div className="musai-piece-score-viewer__pager">
          <button
            type="button"
            className="musai-piece-score-viewer__page-btn"
            disabled={pageIndex <= 0}
            onClick={() => {
              tapFeedback("light");
              setPageIndex((i) => clampScorePageIndex(i - 1, pageCount));
            }}
          >
            Previous
          </button>
          <p className="musai-piece-score-viewer__page-label">
            Page {pageIndex + 1} of {pageCount}
          </p>
          <button
            type="button"
            className="musai-piece-score-viewer__page-btn"
            disabled={pageIndex >= pageCount - 1}
            onClick={() => {
              tapFeedback("light");
              setPageIndex((i) => clampScorePageIndex(i + 1, pageCount));
            }}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
