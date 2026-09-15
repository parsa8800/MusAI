import { collectCursorWalkSamples } from "@/features/piece-studio/score/cursorSnapshotWalk";
import { alignCursorSamplesToNotes } from "@/features/piece-studio/score/cursorNoteAlign";
import { collectNoteheadPosesFromDom } from "@/features/piece-studio/score/noteheadPoses";
import {
  applyPieceOsmdTheme,
  applyPieceOsmdZoom,
  type PieceOsmdTheme,
  type PieceOsmdThemable,
} from "@/features/piece-studio/score/osmdTheme";
import type { ScoreRenderer } from "@/features/piece-studio/score/ScoreRenderer";
import type { ScoreRenderSource } from "@/features/piece-studio/score/scoreRenderSource";
import type { CursorPose } from "@/features/piece-studio/score/cursorTrack";
import {
  applyPieceOsmdPageMargins,
  continuousZoomBoost,
  centerCropOsmdHostToMusic,
  fitOsmdHostToContent,
  nextImportPreviewSingleSystemZoom,
  prepareOsmdHostForPaint,
  pieceOsmdZoomForPresentation,
  pieceScoreOsmdPageFormat,
  scaleOsmdHostToImportPreview,
  scaleOsmdHostToWorkspaceReading,
  type ScoreLayoutMetrics,
  type ScorePaintOptions,
} from "@/features/piece-studio/score/scorePresentation";
import { MIN_SCORE_VIEWPORT_WIDTH_PX } from "@/features/piece-studio/score/scoreViewport";

type OsmdCursor = {
  reset: () => void;
  next: () => void;
  show: () => void;
  hide: () => void;
  update: () => void;
  cursorElement?: HTMLElement;
  Iterator?: {
    EndReached: boolean;
    currentTimeStamp?: { RealValue: number };
    CurrentSourceTimestamp?: { RealValue: number };
  };
  iterator?: {
    EndReached: boolean;
    currentTimeStamp?: { RealValue: number };
    CurrentSourceTimestamp?: { RealValue: number };
  };
  NotesUnderCursor?: () => readonly unknown[];
  SkipInvisibleNotes?: boolean;
};

type OsmdMusicPage = {
  musicSystems?: unknown[];
};

type OsmdHandle = PieceOsmdThemable & {
  load: (content: string) => Promise<unknown>;
  render: () => void;
  clear?: () => void;
  setPageFormat?: (format: string) => void;
  cursor?: OsmdCursor;
  cursors?: OsmdCursor[];
  enableOrDisableCursors?: (enable: boolean) => void;
  GraphicSheet?: {
    MusicPages?: OsmdMusicPage[];
  };
};

type OsmdCtor = new (el: HTMLElement, opts?: object) => OsmdHandle;

function resolveOsmdCtor(mod: Record<string, unknown>): OsmdCtor | null {
  const layers: unknown[] = [mod, mod.default];
  if (mod.default && typeof mod.default === "object") {
    layers.push((mod.default as { default?: unknown }).default);
  }
  for (const layer of layers) {
    if (layer && typeof layer === "object") {
      const ctor = (layer as { OpenSheetMusicDisplay?: unknown })
        .OpenSheetMusicDisplay;
      if (typeof ctor === "function") return ctor as OsmdCtor;
    }
  }
  for (const layer of layers) {
    if (typeof layer === "function") return layer as OsmdCtor;
  }
  return null;
}

function getCursor(osmd: OsmdHandle): OsmdCursor | null {
  const fromList = osmd.cursors?.[0];
  if (fromList && typeof fromList.next === "function") return fromList;
  const single = osmd.cursor;
  if (single && typeof single.next === "function") return single;
  return null;
}

function emptyMetrics(): ScoreLayoutMetrics {
  return {
    pageCount: 0,
    systemCount: 0,
    contentWidthPx: 0,
    contentHeightPx: 0,
  };
}

function readSheetMetrics(
  osmd: OsmdHandle,
  fitted: { contentWidthPx: number; contentHeightPx: number },
): ScoreLayoutMetrics {
  const pages = osmd.GraphicSheet?.MusicPages ?? [];
  const systemCount = pages.reduce(
    (n, page) => n + (page.musicSystems?.length ?? 0),
    0,
  );
  return {
    pageCount: Math.max(pages.length, fitted.contentWidthPx > 0 ? 1 : 0),
    systemCount,
    contentWidthPx: fitted.contentWidthPx,
    contentHeightPx: fitted.contentHeightPx,
  };
}

/**
 * OpenSheetMusicDisplay implementation of ScoreRenderer.
 * The only Piece Studio module that may import `opensheetmusicdisplay`.
 */
export function createOpenSheetMusicDisplayRenderer(): ScoreRenderer {
  let host: HTMLElement | null = null;
  let osmd: OsmdHandle | null = null;
  let mountGeneration = 0;
  let cursorsEnabled = false;
  let lastViewMode: ScorePaintOptions["viewMode"] = "continuous";
  /** Container width passed to prepareOsmdHostForPaint / OSMD render(). */
  let lastPaintWidthPx = 0;

  return {
    id: "opensheetmusicdisplay",

    async mount(nextHost) {
      const generation = ++mountGeneration;
      const mountHost = nextHost;
      host = mountHost;
      mountHost.replaceChildren();
      cursorsEnabled = false;
      const mod = await import("opensheetmusicdisplay");
      // dispose() / remount may have run while the dynamic import was in flight
      if (generation !== mountGeneration || host !== mountHost) return;
      const OSMD = resolveOsmdCtor(mod as Record<string, unknown>);
      if (!OSMD) throw new Error("OpenSheetMusicDisplay missing");
      if (!mountHost.isConnected) {
        throw new Error("Score host is not in the document");
      }
      osmd = new OSMD(mountHost, {
        backend: "svg",
        autoResize: false,
        disableCursor: false,
        followCursor: false,
        drawingParameters: "default",
        drawTitle: false,
        drawSubtitle: false,
        drawComposer: false,
        drawLyricist: false,
        drawCredits: false,
        // Piece Studio is a practice surface — part labels add clutter, not clarity.
        drawPartNames: false,
        drawPartAbbreviations: false,
        pageFormat: "Endless",
        cursorsOptions: [
          {
            type: 1,
            color: "#b4532a",
            alpha: 0.01,
            follow: false,
          },
        ],
      });
      // Do not call enableOrDisableCursors here — OSMD cursor elements exist
      // only after the first render().
    },

    async load(source: ScoreRenderSource) {
      if (!osmd) throw new Error("Score renderer is not mounted");
      if (source.format !== "musicxml") {
        throw new Error("This renderer only accepts MusicXML interchange.");
      }
      await osmd.load(source.content);
    },

    paint(theme: PieceOsmdTheme, options?: ScorePaintOptions): ScoreLayoutMetrics {
      if (!osmd || !host) return emptyMetrics();
      const viewMode = options?.viewMode ?? "continuous";
      // Prefer the scroll wrap width — the SVG host is often `fit-content` and
      // still empty here, so host.clientWidth is 0 and OSMD engraves blank.
      const parentW =
        host.parentElement?.clientWidth ||
        host.parentElement?.getBoundingClientRect().width ||
        0;
      const viewportW =
        options?.viewportWidthPx ||
        parentW ||
        host.clientWidth ||
        host.getBoundingClientRect().width ||
        0;
      const viewportH = options?.viewportHeightPx || 0;
      lastViewMode = viewMode;

      if (viewportW < MIN_SCORE_VIEWPORT_WIDTH_PX) {
        return emptyMetrics();
      }

      // OSMD measures *this* container for SkyBottomLineCalculator — must be
      // non-zero *before every* render(), including the zoom-boost pass.
      prepareOsmdHostForPaint(host, viewportW);
      lastPaintWidthPx = viewportW;

      const pageFormat = pieceScoreOsmdPageFormat(viewMode);
      try {
        osmd.setPageFormat?.(pageFormat);
      } catch {
        /* keep previous format */
      }

      applyPieceOsmdTheme(osmd, theme);
      const purpose = options?.purpose ?? "workspace";
      applyPieceOsmdPageMargins(osmd.EngravingRules ?? null, viewMode, purpose);
      let zoom = pieceOsmdZoomForPresentation(
        viewportW,
        viewportH,
        viewMode,
        purpose,
      );
      applyPieceOsmdZoom(osmd, viewportW, zoom);
      osmd.render();

      // Cursor DOM exists only after render; enable once for playback snapshots.
      if (!cursorsEnabled) {
        try {
          osmd.enableOrDisableCursors?.(true);
          cursorsEnabled = true;
        } catch {
          /* cursor optional until next paint */
        }
      }

      let fitted =
        viewMode === "overview"
          ? (() => {
              const sized = fitOsmdHostToContent(host);
              host.style.width = "100%";
              host.style.maxWidth = "100%";
              host.style.marginInline = "0";
              host.style.height = "auto";
              return sized;
            })()
          : fitOsmdHostToContent(host, {
              cropEmptyPage: purpose !== "import-preview",
            });

      // Short Continuous scores: one adaptive zoom pass so they don't look lost.
      // Workspace skips OSMD boost (display scale) so Twinkle stays one system.
      if (viewMode === "continuous" && viewportW > 0 && purpose !== "workspace") {
        const draft = readSheetMetrics(osmd, fitted);
        const boosted = continuousZoomBoost(
          zoom,
          draft,
          viewportW,
          viewportH || fitted.contentHeightPx * 2,
          purpose,
        );
        if (boosted != null) {
          zoom = boosted;
          prepareOsmdHostForPaint(host, viewportW);
          applyPieceOsmdZoom(osmd, viewportW, zoom);
          osmd.render();
          fitted = fitOsmdHostToContent(host);
        }
      }

      // Workspace Continuous: if a short score still wrapped, step zoom down
      // until it fits one system (size comes from display scale after).
      if (purpose === "workspace" && viewMode === "continuous") {
        let draft = readSheetMetrics(osmd, fitted);
        if (draft.pageCount <= 1 && draft.systemCount > 1 && draft.systemCount <= 3) {
          const zoomBeforePack = zoom;
          let packed = false;
          const downSteps = [1.0, 0.95, 0.9, 0.85, 0.8] as const;
          for (const tryZoom of downSteps) {
            if (tryZoom >= zoomBeforePack - 0.001) continue;
            prepareOsmdHostForPaint(host, viewportW);
            applyPieceOsmdZoom(osmd, viewportW, tryZoom);
            osmd.render();
            const tryFit = fitOsmdHostToContent(host);
            const tryMetrics = readSheetMetrics(osmd, tryFit);
            if (tryMetrics.systemCount === 1) {
              zoom = tryZoom;
              fitted = tryFit;
              draft = tryMetrics;
              packed = true;
              break;
            }
          }
          // Failed pack attempts leave the DOM on the last try — restore.
          if (!packed) {
            prepareOsmdHostForPaint(host, viewportW);
            applyPieceOsmdZoom(osmd, viewportW, zoomBeforePack);
            osmd.render();
            fitted = fitOsmdHostToContent(host);
            draft = readSheetMetrics(osmd, fitted);
          }
        }
        if (draft.pageCount <= 1 && draft.systemCount <= 3) {
          fitted = centerCropOsmdHostToMusic(host);
          const afterCrop = readSheetMetrics(osmd, fitted);
          fitted = scaleOsmdHostToWorkspaceReading(
            host,
            viewportW,
            viewportH || fitted.contentHeightPx * 2,
            afterCrop,
          );
        }
      }

      // Import review: largest one-system zoom for playable note size, then
      // gentle display scale. Never crop Continuous pages to a thin strip.
      if (purpose === "import-preview" && viewMode === "continuous") {
        let previewMetrics = readSheetMetrics(osmd, fitted);
        if (previewMetrics.systemCount === 1) {
          let nextZoom = nextImportPreviewSingleSystemZoom(zoom);
          while (nextZoom != null) {
            prepareOsmdHostForPaint(host, viewportW);
            applyPieceOsmdZoom(osmd, viewportW, nextZoom);
            osmd.render();
            const tryFit = fitOsmdHostToContent(host, { cropEmptyPage: false });
            const tryMetrics = readSheetMetrics(osmd, tryFit);
            if (tryMetrics.systemCount === 1) {
              zoom = nextZoom;
              fitted = tryFit;
              previewMetrics = tryMetrics;
              nextZoom = nextImportPreviewSingleSystemZoom(zoom);
            } else {
              prepareOsmdHostForPaint(host, viewportW);
              applyPieceOsmdZoom(osmd, viewportW, zoom);
              osmd.render();
              fitted = fitOsmdHostToContent(host, { cropEmptyPage: false });
              break;
            }
          }
        }
        fitted = scaleOsmdHostToImportPreview(
          host,
          viewportW,
          viewportH || fitted.contentHeightPx * 2,
          fitted,
        );
        fitted = centerCropOsmdHostToMusic(host);
      }

      const metrics = readSheetMetrics(osmd, fitted);

      const svgs = [...host.querySelectorAll("svg")];
      if (viewMode === "page") {
        svgs.forEach((svg, i) => {
          (svg as SVGElement).style.display = i === 0 ? "block" : "none";
        });
      } else {
        svgs.forEach((svg) => {
          (svg as SVGElement).style.display = "block";
        });
      }

      return metrics;
    },

    setVisiblePage(pageIndex: number) {
      if (!host || lastViewMode !== "page") return;
      const svgs = [...host.querySelectorAll("svg")];
      svgs.forEach((svg, i) => {
        (svg as SVGElement).style.display = i === pageIndex ? "block" : "none";
      });
    },

    collectCursorSnapshots(wrap, wholeNotesToSeconds, noteTimes): CursorPose[] {
      if (!osmd) return [];
      try {
        osmd.enableOrDisableCursors?.(true);
        cursorsEnabled = true;
      } catch {
        /* cursor optional */
      }

      // Prefer engraved noteheads in the SVG — one pose per sounding head.
      // The OSMD iterator walk often stops mid-piece or lands on the meter.
      if (noteTimes && noteTimes.length > 0) {
        const heads = collectNoteheadPosesFromDom(wrap);
        if (heads.length > 0) {
          const fromDom = alignCursorSamplesToNotes(
            heads.map((h, i) => ({
              realValue: i,
              x: h.x,
              y: h.y,
              height: h.height,
            })),
            noteTimes,
            wholeNotesToSeconds,
          );
          if (fromDom.length === noteTimes.length) {
            return fromDom;
          }
        }
      }

      const cursor = getCursor(osmd);
      if (!cursor) return [];
      const samples = collectCursorWalkSamples(
        cursor,
        wrap,
        {
          paintWidthPx: lastPaintWidthPx,
        },
        undefined,
        noteTimes && noteTimes.length > 0
          ? { targetNoteCount: noteTimes.length }
          : undefined,
      );
      if (noteTimes && noteTimes.length > 0) {
        return alignCursorSamplesToNotes(
          samples,
          noteTimes,
          wholeNotesToSeconds,
        );
      }
      return samples.map((sample) => ({
        tSec: wholeNotesToSeconds(sample.realValue),
        x: sample.x,
        y: sample.y,
        height: sample.height,
      }));
    },

    dispose() {
      mountGeneration += 1;
      cursorsEnabled = false;
      try {
        osmd?.clear?.();
      } catch {
        /* ignore */
      }
      osmd = null;
      if (host) host.replaceChildren();
      host = null;
    },
  };
}
