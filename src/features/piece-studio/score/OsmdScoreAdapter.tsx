"use client";

import { animate } from "animejs";
import { useEffect, useMemo, useRef, useState } from "react";
import { createDefaultScoreRenderer } from "@/features/piece-studio/score/createDefaultScoreRenderer";
import {
  overlayNoteUnderlinesForRange,
  overlayRectsForRange,
  shapePassageUnderlay,
} from "@/features/piece-studio/score/scoreOverlayGeometry";
import {
  applyPitchNoteheadTints,
  clearPitchNoteheadTints,
} from "@/features/piece-studio/score/pitchNoteheadTint";
import type { PitchNoteMark } from "@/features/piece-studio/feedback/visual/piecePitchScoreMap";
import { collectStaffBandsFromDom } from "@/features/piece-studio/score/staffBands";
import { ScorePlaybackPlayhead } from "@/features/piece-studio/score/ScorePlaybackPlayhead";
import {
  pickCursorTime,
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
  type PieceScoreViewMode,
  type ScoreLayoutMetrics,
  type ScoreScrollDensity,
} from "@/features/piece-studio/score/scorePresentation";
import {
  canPaintScoreViewport,
  musicXmlPreviewLog,
  waitForScoreViewport,
} from "@/features/piece-studio/score/scoreViewport";
import { MUSAI_DUR, MUSAI_EASE, prefersReducedMotion } from "@/lib/motion";

function errorLogDetail(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return { message: err.message || err.name, stack: err.stack };
  }
  if (err && typeof err === "object") {
    const rec = err as { message?: unknown; stack?: unknown };
    const message =
      typeof rec.message === "string" && rec.message
        ? rec.message
        : (() => {
            try {
              return JSON.stringify(err);
            } catch {
              return String(err);
            }
          })();
    return {
      message,
      stack: typeof rec.stack === "string" ? rec.stack : undefined,
    };
  }
  return { message: String(err) };
}

export type PieceScoreHighlight = {
  id: string;
  startWholeNotes: number;
  endWholeNotes: number;
  /** Accessible name only — never drawn as a label on the score. */
  label: string;
  source?: "analysis" | "mock-preview";
  visualTone?: "pitch" | "rhythm" | "rushing" | "dragging" | "dynamics" | null;
  visualStyle?: "note" | "measure" | "heat" | null;
  /** Focused issue vs other issues in the same category. */
  emphasis?: "focus" | "related";
  /**
   * Pitch notehead tint — sharp / flat / missed.
   * When set with pitch tone, heads are coloured in the SVG (no circle plate).
   */
  pitchKind?: "sharp" | "flat" | "missed" | null;
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

export const PIECE_SCORE_ORIGINAL_SLOT_ID = "musai-piece-original-slot";

/**
 * React shell over ScoreRenderer.
 * Consumes MusicXML interchange for engraving; playback timing stays on MusaiScoreV1.
 * Does not import OpenSheetMusicDisplay directly.
 */
export function OsmdScoreAdapter({
  musicXml,
  title,
  followPlayback = false,
  showPlayhead,
  subscribePlaybackTime,
  getPlaybackTime,
  wholeNotesToSeconds,
  onSeek,
  onLoopMark,
  loopSpan = null,
  loopPicking = false,
  onScrubPreview,
  onScrubCommit,
  getPlaying,
  playbackNotes,
  highlight = null,
  highlights = null,
  pitchMarks = null,
  onHighlightSelect,
  onPaintState,
  showInlineError = true,
  themeOverride = null,
  paintPurpose = "workspace",
}: {
  musicXml: string;
  title: string;
  followPlayback?: boolean;
  /**
   * Shared vertical playhead. Defaults to `followPlayback`.
   * Practise turns this on without Listen layout so heat overlays stay.
   */
  showPlayhead?: boolean;
  subscribePlaybackTime?: (listener: PiecePlaybackTimeListener) => () => void;
  getPlaybackTime?: () => number;
  wholeNotesToSeconds?: (wholeNotes: number) => number;
  onSeek?: (tSec: number) => void;
  /** Score tap while a loop is being chosen — start bar, then end bar. */
  onLoopMark?: (tSec: number) => void;
  loopSpan?: { startSec: number; endSec: number } | null;
  loopPicking?: boolean;
  /** Listen playhead drag — silent preview while moving. */
  onScrubPreview?: (tSec: number) => void;
  /** Listen playhead drag — commit on pointer up (`resume` = was playing). */
  onScrubCommit?: (tSec: number, resume: boolean) => void;
  getPlaying?: () => boolean;
  /** MusaiScore note times — when set, playhead clock follows these, not OSMD units. */
  playbackNotes?: readonly { startSec: number; endSec: number }[];
  /** Single focused overlay. Prefer `highlights` when a category has several. */
  highlight?: PieceScoreHighlight | null;
  /** Focused issue overlays. Listen playback hides them. */
  highlights?: readonly PieceScoreHighlight[] | null;
  /**
   * Pitch notehead colour map — tints engraved heads (no circle plates).
   * Cleared when empty / Listen follow mode.
   */
  pitchMarks?: readonly PitchNoteMark[] | null;
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
  const rendererRef = useRef<ScoreRenderer | null>(null);
  const snapsRef = useRef<CursorPose[]>([]);
  const staffBandsRef = useRef<ReturnType<typeof collectStaffBandsFromDom>>(
    [],
  );
  const convertRef = useRef(wholeNotesToSeconds);
  convertRef.current = wholeNotesToSeconds;
  const playbackNotesRef = useRef(playbackNotes);
  playbackNotesRef.current = playbackNotes;
  const onPaintStateRef = useRef(onPaintState);
  onPaintStateRef.current = onPaintState;
  const paintPurposeRef = useRef(paintPurpose);
  paintPurposeRef.current = paintPurpose;
  const playheadOn = showPlayhead ?? followPlayback;
  const themeRef = useRef<PieceOsmdTheme>(
    themeOverride ?? readPieceOsmdTheme(),
  );
  const viewModeRef = useRef<PieceScoreViewMode>("continuous");
  const engravedModeRef = useRef<PieceScoreViewMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snapVersion, setSnapVersion] = useState(0);
  const viewMode: PieceScoreViewMode = "continuous";
  const [pageIndex, setPageIndex] = useState(0);
  const [metrics, setMetrics] = useState<ScoreLayoutMetrics | null>(null);
  const [density, setDensity] = useState<ScoreScrollDensity>("compact");
  /** Re-apply Listen pose after layout snapshot refreshes (snapsRef only). */
  const syncPlaybackPoseRef = useRef<(() => void) | null>(null);
  const suppressScoreClickRef = useRef(false);
  viewModeRef.current = followPlayback ? "continuous" : viewMode;
  const scrubEnabled = Boolean(
    followPlayback && onScrubPreview && onScrubCommit,
  );

  const activeHighlights = useMemo(() => {
    if (highlights && highlights.length > 0) return highlights;
    return highlight ? [highlight] : [];
  }, [highlight, highlights]);

  const heatOverlays = useMemo(() => {
    if (followPlayback || activeHighlights.length === 0) return [];
    const convert =
      convertRef.current ?? ((wn: number) => wn * 4 * (60 / 100));
    const snaps = snapsRef.current;
    const wrap = wrapRef.current;
    const staffBands = wrap ? collectStaffBandsFromDom(wrap) : [];
    type OverlayPaint = {
      key: string;
      highlight: PieceScoreHighlight;
      style: NonNullable<PieceScoreHighlight["visualStyle"]>;
      rect: { x: number; y: number; width: number; height: number };
    };
    const out: OverlayPaint[] = [];
    for (const item of activeHighlights) {
      const style = item.visualStyle ?? "note";
      // Pitch notes are coloured on the engraved head — never a plate/circle.
      if (item.visualTone === "pitch" && style === "note") continue;
      const start = convert(item.startWholeNotes);
      const end = convert(item.endWholeNotes);
      const rects =
        style === "note"
          ? overlayNoteUnderlinesForRange(snaps, start, end)
          : overlayRectsForRange(snaps, start, end, staffBands).map((rect) =>
              shapePassageUnderlay(rect, style),
            );
      rects.forEach((rect, i) => {
        out.push({
          key: `${item.id}-${i}`,
          highlight: item,
          style,
          rect,
        });
      });
    }
    // Focused issue paints above related category cues.
    out.sort((a, b) => {
      const ae = a.highlight.emphasis === "related" ? 0 : 1;
      const be = b.highlight.emphasis === "related" ? 0 : 1;
      return ae - be;
    });
    return out;
    // snapVersion refreshes after layout; highlight identity drives overlays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    followPlayback,
    activeHighlights,
    snapVersion,
  ]);

  const loopWash = useMemo(() => {
    if (!loopSpan) return [];
    const snaps = snapsRef.current;
    const wrap = wrapRef.current;
    const staffBands = wrap ? collectStaffBandsFromDom(wrap) : [];
    return overlayRectsForRange(
      snaps,
      loopSpan.startSec,
      loopSpan.endSec,
      staffBands,
    );
  }, [loopSpan, snapVersion]);

  const focusHighlightId = useMemo(() => {
    const focused = activeHighlights.find(
      (item) => (item.emphasis ?? "focus") === "focus",
    );
    return focused?.id ?? activeHighlights[0]?.id ?? null;
  }, [activeHighlights]);

  useEffect(() => {
    if (followPlayback || !focusHighlightId || heatOverlays.length === 0) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const els = [
      ...wrap.querySelectorAll<HTMLElement>(
        `[data-testid="piece-score-heat"][data-emphasis="focus"]`,
      ),
    ];
    if (els.length === 0) return;
    const reduce = prefersReducedMotion();
    els[0]?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "nearest",
      inline: "nearest",
    });
    if (reduce) return;
    const anim = animate(els, {
      opacity: [0.35, 1],
      duration: MUSAI_DUR.base,
      ease: MUSAI_EASE.out,
    });
    return () => {
      try {
        (anim as { pause: () => void; revert?: () => void }).pause();
        (anim as { revert?: () => void }).revert?.();
      } catch {
        /* cleanup */
      }
    };
  }, [followPlayback, focusHighlightId, heatOverlays]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (followPlayback || !wrap) {
      clearPitchNoteheadTints(wrap);
      return;
    }
    const marks = pitchMarks ?? [];
    const convert =
      convertRef.current ?? ((wn: number) => wn * 4 * (60 / 100));
    applyPitchNoteheadTints(wrap, snapsRef.current, marks, convert);
    return () => {
      clearPitchNoteheadTints(wrap);
    };
    // snapVersion refreshes after layout so heads exist to tint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followPlayback, pitchMarks, snapVersion]);

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
      staffBandsRef.current = collectStaffBandsFromDom(wrap);
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
      staffBandsRef.current = [];
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
        musicXmlPreviewLog("PREVIEW_RENDER_FAIL", errorLogDetail(err));
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
        musicXmlPreviewLog("PREVIEW_RENDER_FAIL", errorLogDetail(err));
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
    if (!playheadOn) return;
    // Playhead armed (Listen or Practise replay) — re-collect once.
    takeSnapshots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playheadOn, followPlayback, subscribePlaybackTime, getPlaybackTime]);

  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const markScore = onLoopMark ?? onSeek;
    if (!followPlayback || !markScore || activeHighlights.length > 0) return;
    if (suppressScoreClickRef.current) {
      suppressScoreClickRef.current = false;
      return;
    }
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const x = event.clientX - rect.left + wrap.scrollLeft;
    const y = event.clientY - rect.top + wrap.scrollTop;
    const t = pickCursorTime(snapsRef.current, x, y);
    if (t != null) markScore(t);
  };

  // Same compact/scroll card on Score, Listen, and Practise — do not force
  // Listen into full-bleed scroll paper for short pieces.
  const effectiveDensity = density;
  const activeMode = "continuous";

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
      <div
        ref={wrapRef}
        className={wrapClass}
        data-playhead={playheadOn ? "true" : "false"}
        data-scrub={scrubEnabled ? "true" : "false"}
        data-loop-pick={loopPicking ? "true" : "false"}
        onClick={onClick}
      >
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
        {loopWash.map((rect, index) => (
          <div
            key={`loop-${index}`}
            className="musai-piece-loop-wash"
            data-testid="piece-loop-wash"
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
            }}
          />
        ))}
        {!followPlayback && heatOverlays.length > 0
          ? heatOverlays.map(({ key, highlight: item, style, rect }) => {
              const mock = item.source !== "analysis";
              const emphasis = item.emphasis ?? "focus";
              return (
                <button
                  key={key}
                  type="button"
                  className={
                    style === "note"
                      ? "musai-piece-heat musai-piece-note-plate"
                      : "musai-piece-heat"
                  }
                  data-testid="piece-score-heat"
                  data-mock={mock ? "true" : "false"}
                  data-source={item.source ?? "mock-preview"}
                  data-tone={item.visualTone ?? undefined}
                  data-style={style ?? "note"}
                  data-role={style === "note" ? "focus" : undefined}
                  data-emphasis={emphasis}
                  data-pitch-kind={item.pitchKind ?? undefined}
                  aria-label={`${item.label} on the score`}
                  style={{
                    left: rect.x,
                    top: rect.y,
                    width: rect.width,
                    height: rect.height,
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onHighlightSelect?.(item.id);
                  }}
                />
              );
            })
          : null}
        <ScorePlaybackPlayhead
          active={Boolean(playheadOn && subscribePlaybackTime)}
          snapsRef={snapsRef}
          staffBandsRef={staffBandsRef}
          scrollParentRef={wrapRef}
          getPlaybackTime={getPlaybackTime}
          subscribePlaybackTime={subscribePlaybackTime}
          syncRef={syncPlaybackPoseRef}
          scrubEnabled={scrubEnabled}
          onScrubPreview={onScrubPreview}
          onScrubCommit={onScrubCommit}
          getPlaying={getPlaying}
          onScrubGesture={() => {
            suppressScoreClickRef.current = true;
          }}
        />
        {showInlineError && error ? (
          <p className="musai-piece-osmd-error" role="status">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
