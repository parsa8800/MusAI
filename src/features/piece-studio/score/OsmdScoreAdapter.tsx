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
import { shapeNotePlateRect } from "@/features/piece-studio/score/notePlate";
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

/**
 * True only when OSMD left real notation geometry (not an empty SVG shell).
 * Blank paints often leave a large attributed SVG plus a tiny .cursor remnant —
 * do not treat attribute width alone as engraved music.
 * Also reject OSMD page wrappers stuck at width:0 (getBBox can still look valid).
 */
export function hostHasVisibleEngraving(host: HTMLElement | null): boolean {
  if (!host) return false;
  const svgs = [...host.querySelectorAll("svg")] as SVGSVGElement[];
  if (svgs.length === 0) return false;

  const pages = [
    ...host.querySelectorAll<HTMLElement>('[id^="osmdCanvasPage"]'),
  ];
  if (pages.length > 0) {
    const anyOpen = pages.some((page) => {
      const styled = Number.parseFloat(page.style.width || "");
      const w =
        page.clientWidth ||
        page.getBoundingClientRect().width ||
        (Number.isFinite(styled) ? styled : 0);
      return w >= 40;
    });
    if (!anyOpen) return false;
  }

  for (const svg of svgs) {
    const marks = [...svg.querySelectorAll(
      "path, line, rect, use, circle, ellipse, polyline, polygon, text",
    )].filter((el) => !el.closest(".cursor"));
    if (marks.length < 8) continue;
    const layout = svg.getBoundingClientRect();
    if (layout.width > 0 || layout.height > 0) {
      if (layout.width < 40 || layout.height < 24) continue;
    }
    try {
      const box = svg.getBBox();
      if (box.width >= 40 && box.height >= 24) return true;
    } catch {
      // getBBox can throw if not in the document yet — fall back to mark count.
      if (marks.length >= 16) return true;
    }
  }
  return false;
}

function resolveScorePaintViewport(wrap: HTMLElement): {
  width: number;
  height: number;
  wrapWidth: number;
} {
  const wrapW = wrap.clientWidth || wrap.getBoundingClientRect().width || 0;
  const wrapH = wrap.clientHeight || wrap.getBoundingClientRect().height || 0;
  let stage: HTMLElement | null = wrap.parentElement;
  while (
    stage &&
    !stage.classList.contains("musai-piece-workspace__stage") &&
    !stage.classList.contains("musai-piece-score__stage") &&
    !stage.classList.contains("musai-piece-score-viewer") &&
    !stage.classList.contains("musai-piece-score--embedded")
  ) {
    stage = stage.parentElement;
  }
  const stageW = stage
    ? stage.clientWidth || stage.getBoundingClientRect().width || 0
    : 0;
  const stageH = stage
    ? stage.clientHeight || stage.getBoundingClientRect().height || 0
    : 0;
  return {
    width: Math.max(wrapW, stageW),
    height: Math.max(wrapH, stageH),
    wrapWidth: wrapW,
  };
}

function metricsLookEngraved(metrics: ScoreLayoutMetrics): boolean {
  return metrics.contentWidthPx >= 12 && metrics.contentHeightPx >= 12;
}

function shapeOverlayRect(
  rect: { x: number; y: number; width: number; height: number },
  style: PieceScoreHighlight["visualStyle"],
) {
  if (style === "note") {
    return shapeNotePlateRect(rect);
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
  playbackNotes,
  highlight = null,
  onHighlightSelect,
  onPaintState,
  showInlineError = true,
  themeOverride = null,
  paintPurpose = "workspace",
}: {
  musicXml: string;
  title: string;
  followPlayback?: boolean;
  subscribePlaybackTime?: (listener: PiecePlaybackTimeListener) => () => void;
  getPlaybackTime?: () => number;
  wholeNotesToSeconds?: (wholeNotes: number) => number;
  onSeek?: (tSec: number) => void;
  /** MusaiScore note times — when set, playhead clock follows these, not OSMD units. */
  playbackNotes?: readonly { startSec: number; endSec: number }[];
  /** One focused overlay at a time. Listen playback hides it. */
  highlight?: PieceScoreHighlight | null;
  onHighlightSelect?: (id: string) => void;
  /** Fires preparing → ready | failed. Import review gates confirm on `ready`. */
  onPaintState?: (state: ScorePaintState) => void;
  /** When false, parent owns the failure UI (no inline error card). */
  showInlineError?: boolean;
  themeOverride?: PieceOsmdTheme | null;
  /** Import review uses a larger, centred engraving. */
  paintPurpose?: "workspace" | "import-preview";
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const bandRef = useRef<HTMLSpanElement>(null);
  const rendererRef = useRef<ScoreRenderer | null>(null);
  const snapsRef = useRef<CursorPose[]>([]);
  const convertRef = useRef(wholeNotesToSeconds);
  convertRef.current = wholeNotesToSeconds;
  const playbackNotesRef = useRef(playbackNotes);
  playbackNotesRef.current = playbackNotes;
  const onPaintStateRef = useRef(onPaintState);
  onPaintStateRef.current = onPaintState;
  const paintPurposeRef = useRef(paintPurpose);
  paintPurposeRef.current = paintPurpose;
  const themeRef = useRef<PieceOsmdTheme>(
    themeOverride ?? readPieceOsmdTheme(),
  );
  const viewModeRef = useRef<PieceScoreViewMode>("continuous");
  const engravedModeRef = useRef<PieceScoreViewMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snapVersion, setSnapVersion] = useState(0);
  const [viewMode, setViewMode] = useState<PieceScoreViewMode>("continuous");
  const [pageIndex, setPageIndex] = useState(0);
  const [metrics, setMetrics] = useState<ScoreLayoutMetrics | null>(null);
  const [density, setDensity] = useState<ScoreScrollDensity>("scroll");
  const [viewportHeight, setViewportHeight] = useState(0);
  const lastScrollY = useRef<number | null>(null);
  /** Re-apply Listen pose after layout snapshot refreshes (snapsRef only). */
  const syncPlaybackPoseRef = useRef<(() => void) | null>(null);
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
      const next = renderer.collectCursorSnapshots(
        wrap,
        convert,
        playbackNotesRef.current,
      );
      snapsRef.current = next;
      if (process.env.NODE_ENV !== "production") {
        const svg = wrap.querySelector("svg");
        const wrapRect = wrap.getBoundingClientRect();
        const svgRect = svg?.getBoundingClientRect();
        const svgLeft = svgRect
          ? svgRect.left - wrapRect.left + wrap.scrollLeft
          : 0;
        const svgRight = svgLeft + (svgRect?.width ?? 0);
        const xLast = next[next.length - 1]?.x ?? 0;
        console.info("[piece-osmd] cursor snapshots", {
          count: next.length,
          notes: playbackNotesRef.current?.length ?? 0,
          t0: next[0]?.tSec,
          tLast: next[next.length - 1]?.tSec,
          note0: playbackNotesRef.current?.[0]?.startSec,
          noteLast:
            playbackNotesRef.current?.[
              (playbackNotesRef.current?.length ?? 1) - 1
            ]?.startSec,
          x0: next[0]?.x,
          xLast,
          svgLeft,
          svgRight,
          withinContent: xLast <= svgRight + 12,
          boundToNotes:
            Boolean(playbackNotesRef.current?.length) &&
            next.length === playbackNotesRef.current?.length,
        });
        (
          window as unknown as { __pieceCursorSnaps?: typeof next }
        ).__pieceCursorSnaps = next;
      }
    } catch (err) {
      snapsRef.current = [];
      if (process.env.NODE_ENV !== "production") {
        console.error("[piece-osmd] cursor snapshot walk failed", err);
      }
    }
    setSnapVersion((n) => n + 1);
    syncPlaybackPoseRef.current?.();
  };

  /** After Listen toggles --follow/--scroll, wait a frame so layout matches poses. */
  const takeSnapshotsAfterLayout = () => {
    let outer = 0;
    let inner = 0;
    outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => {
        takeSnapshots();
      });
    });
    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
    };
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

    /** Soft layout retries before a hard fail — workspace flex can settle late. */
    let softFailCount = 0;
    const MAX_SOFT_FAILS = 10;

    const noteSoftFail = (detail: string) => {
      softFailCount += 1;
      musicXmlPreviewLog("PREVIEW_RENDER_FAIL", {
        message: detail,
        softFail: softFailCount,
      });
      if (softFailCount >= MAX_SOFT_FAILS) {
        failPaint(detail);
      }
    };

    const paint = (opts?: { force?: boolean }) => {
      if (!renderer || cancelled) return false;
      const { width, height, wrapWidth } = resolveScorePaintViewport(wrap);
      // Never engrave into a zero-size host — OSMD leaves a blank score.
      if (!canPaintScoreViewport(width, height)) {
        if (process.env.NODE_ENV !== "production") {
          console.info("[PREVIEW_RENDER_START] waiting for layout size", {
            width,
            height,
            wrapWidth,
            force: Boolean(opts?.force),
          });
        }
        return false;
      }
      if (
        !opts?.force &&
        lastPaintWidth > 0 &&
        Math.abs(width - lastPaintWidth) < 24 &&
        hostHasVisibleEngraving(host)
      ) {
        return false;
      }
      try {
        musicXmlPreviewLog("PREVIEW_RENDER_START", {
          width,
          height,
          wrapWidth,
          xmlChars: musicXml.length,
          force: Boolean(opts?.force),
        });
        const nextMetrics = renderer.paint(themeRef.current, {
          viewMode: viewModeRef.current,
          viewportWidthPx: width,
          viewportHeightPx: height,
          purpose: paintPurposeRef.current,
        });
        if (!cancelled) {
          engravedModeRef.current = viewModeRef.current;
          setMetrics(nextMetrics);
          setViewportHeight(height);
          setDensity((prev) => {
            const next =
              paintPurposeRef.current === "import-preview"
                ? "compact"
                : classifyScoreScrollDensity(nextMetrics, height || width);
            return prev === next ? prev : next;
          });
          if (viewModeRef.current === "page") {
            setPageIndex(0);
            renderer.setVisiblePage?.(0);
          }
          if (
            metricsLookEngraved(nextMetrics) &&
            hostHasVisibleEngraving(host)
          ) {
            lastPaintWidth = width;
            softFailCount = 0;
            musicXmlPreviewLog("PREVIEW_RENDER_SUCCESS", {
              width,
              pageCount: nextMetrics.pageCount,
              contentWidthPx: nextMetrics.contentWidthPx,
              contentHeightPx: nextMetrics.contentHeightPx,
              markProbe: host.querySelectorAll("path, line, rect, use").length,
            });
            setError(null);
            reportPaint("ready");
          } else {
            // Do not lock lastPaintWidth on a blank shell — ResizeObserver must retry.
            lastPaintWidth = 0;
            noteSoftFail("paint produced no visible notation");
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
        themeRef.current = themeOverride ?? readPieceOsmdTheme();
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
        if (!canPaintScoreViewport(layout.width, layout.height)) {
          // One more frame after CSS flex settle (import review / workspace).
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          if (cancelled) {
            renderer.dispose();
            return;
          }
        }
        const painted = paint({ force: true });
        if (!painted && !cancelled) {
          // ResizeObserver will retry; one more forced attempt after layout paint.
          window.requestAnimationFrame(() => {
            if (cancelled) return;
            if (paint({ force: true })) {
              scheduleSnapshot();
              return;
            }
            if (lastPaintWidth < 1) {
              noteSoftFail("viewport still unusable after layout wait");
            }
          });
          return;
        }
        window.requestAnimationFrame(() => {
          if (cancelled) return;
          if (!hostHasVisibleEngraving(host)) {
            // One forced re-paint after the frame is in the visible tree.
            if (!paint({ force: true }) || !hostHasVisibleEngraving(host)) {
              noteSoftFail("notation missing after first paint");
              return;
            }
          } else {
            paint();
          }
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
        const { width, wrapWidth } = resolveScorePaintViewport(wrap);
        const engraved = hostHasVisibleEngraving(host);
        // Compact hug shrinks wrap around fitted SVG. Never re-engrave into
        // that narrower box — it blanks OSMD. Only refresh cursor poses.
        if (
          lastPaintWidth > 0 &&
          wrapWidth > 0 &&
          wrapWidth + 24 < lastPaintWidth
        ) {
          scheduleSnapshot();
          return;
        }
        if (
          engraved &&
          lastPaintWidth > 0 &&
          width > 0 &&
          width <= lastPaintWidth + 24
        ) {
          scheduleSnapshot();
          return;
        }
        const needsForce = lastPaintWidth < 1 || !engraved;
        if (paint({ force: needsForce })) scheduleSnapshot();
      }, 140);
    };

    const onThemeMutation = () => {
      if (themeOverride) return;
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
  }, [musicXml, themeOverride]);

  // Re-engrave only when the engraved page format actually changes.
  // Score ↔ Listen both use Continuous — skip a full paint on that toggle.
  useEffect(() => {
    const renderer = rendererRef.current;
    const wrap = wrapRef.current;
    if (!renderer || !wrap) return;
    const mode: PieceScoreViewMode = followPlayback ? "continuous" : viewMode;
    if (engravedModeRef.current === mode) {
      if (followPlayback) {
        return takeSnapshotsAfterLayout();
      }
      return;
    }
    const { width, height } = resolveScorePaintViewport(wrap);
    if (!canPaintScoreViewport(width, height)) return;
    try {
      const nextMetrics = renderer.paint(themeRef.current, {
        viewMode: mode,
        viewportWidthPx: width,
        viewportHeightPx: height,
        purpose: paintPurposeRef.current,
      });
      engravedModeRef.current = mode;
      setMetrics(nextMetrics);
      setViewportHeight(height);
      setDensity((prev) => {
        const next =
          paintPurposeRef.current === "import-preview"
            ? "compact"
            : classifyScoreScrollDensity(nextMetrics, height || width);
        return prev === next ? prev : next;
      });
      if (!followPlayback && mode === "page") {
        const page = clampScorePageIndex(pageIndex, nextMetrics.pageCount);
        setPageIndex(page);
        renderer.setVisiblePage?.(page);
      }
      return takeSnapshotsAfterLayout();
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[piece-osmd] view mode paint failed", err);
      }
    }
    // pageIndex intentionally read for Overview → Page jump; do not re-run on pager alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, followPlayback]);

  // Always re-bind when Listen arms or the timeline notes arrive.
  useEffect(() => {
    if (!rendererRef.current || !wrapRef.current) return;
    if (!hostHasVisibleEngraving(hostRef.current)) return;
    if (!followPlayback && !playbackNotes?.length) return;
    return takeSnapshotsAfterLayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followPlayback, playbackNotes]);

  // Density class changes compact↔scroll (and :has hug). Refresh poses after layout.
  useEffect(() => {
    if (!rendererRef.current || !wrapRef.current) return;
    if (!hostHasVisibleEngraving(hostRef.current)) return;
    return takeSnapshotsAfterLayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [density]);

  useEffect(() => {
    if (viewMode !== "page" || followPlayback) return;
    rendererRef.current?.setVisiblePage?.(pageIndex);
  }, [pageIndex, viewMode, followPlayback]);

  useEffect(() => {
    const el = cursorRef.current;
    const band = bandRef.current;
    if (!followPlayback) {
      if (el) el.style.visibility = "hidden";
      if (band) band.style.visibility = "hidden";
      lastScrollY.current = null;
      return;
    }
    if (!subscribePlaybackTime) return;

    // Listen armed — re-collect once. snaps live in snapsRef; do not depend on
    // snapVersion here or takeSnapshots → setSnapVersion loops forever.
    takeSnapshots();

    const applyPose = (next: CursorBand | null) => {
      if (!band) return;
      if (!next) {
        if (el) el.style.visibility = "hidden";
        band.style.visibility = "hidden";
        return;
      }
      if (el) el.style.visibility = "visible";
      band.style.visibility = "visible";
      band.style.width = `${next.width}px`;
      band.style.height = `${next.height}px`;
      band.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`;

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

    syncPlaybackPoseRef.current = () => {
      onTime(getPlaybackTime?.() ?? 0);
    };
    onTime(getPlaybackTime?.() ?? 0);
    const unsubscribe = subscribePlaybackTime(onTime);
    return () => {
      syncPlaybackPoseRef.current = null;
      unsubscribe();
    };
    // snapVersion intentionally omitted — snapsRef is updated in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followPlayback, subscribePlaybackTime, getPlaybackTime]);

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
  // Same compact/scroll card on Score, Listen, and Practise — do not force
  // Listen into full-bleed scroll paper for short pieces.
  const effectiveDensity = density;
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
              const style = highlight.visualStyle ?? "note";
              const isNote = style === "note";
              const shaped = shapeOverlayRect(rect, isNote ? "note" : style);
              const mock = highlight.source !== "analysis";
              return (
                <button
                  key={`${highlight.id}-${i}`}
                  type="button"
                  className={
                    isNote
                      ? "musai-piece-note-plate musai-piece-heat"
                      : "musai-piece-heat"
                  }
                  data-testid="piece-score-heat"
                  data-mock={mock ? "true" : "false"}
                  data-source={highlight.source ?? "mock-preview"}
                  data-tone={highlight.visualTone ?? undefined}
                  data-style={style}
                  data-role={isNote ? "focus" : undefined}
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
                  <span
                    className={
                      isNote
                        ? "musai-piece-note-plate__marker"
                        : "musai-piece-heat__marker"
                    }
                    aria-hidden
                  />
                </button>
              );
            })
          : null}
        <span
          ref={bandRef}
          className="musai-piece-note-plate"
          data-testid="piece-score-cursor-band"
          data-style="note"
          data-role="now"
          aria-hidden
          style={{ visibility: "hidden" }}
        >
          <span
            ref={cursorRef}
            className="musai-piece-note-plate__marker"
            data-testid="piece-score-cursor"
            aria-hidden
          />
        </span>
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
