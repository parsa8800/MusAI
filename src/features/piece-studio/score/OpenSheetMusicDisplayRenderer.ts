import { collectCursorSnapshotsFromWalk } from "@/features/piece-studio/score/cursorSnapshotWalk";
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
  fitOsmdHostToContent,
  pieceOsmdZoomForPresentation,
  pieceScoreOsmdPageFormat,
  type ScoreLayoutMetrics,
  type ScorePaintOptions,
} from "@/features/piece-studio/score/scorePresentation";

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
  return osmd.cursor ?? osmd.cursors?.[0] ?? null;
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
      const viewportW =
        options?.viewportWidthPx ||
        host.clientWidth ||
        host.getBoundingClientRect().width ||
        0;
      const viewportH = options?.viewportHeightPx || 0;
      lastViewMode = viewMode;

      const pageFormat = pieceScoreOsmdPageFormat(viewMode);
      try {
        osmd.setPageFormat?.(pageFormat);
      } catch {
        /* keep previous format */
      }

      applyPieceOsmdTheme(osmd, theme);
      applyPieceOsmdPageMargins(osmd.EngravingRules ?? null, viewMode);
      let zoom = pieceOsmdZoomForPresentation(viewportW, viewportH, viewMode);
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
          : fitOsmdHostToContent(host);

      // Short Continuous scores: one adaptive zoom pass so they don't look lost.
      if (viewMode === "continuous" && viewportW > 0) {
        const draft = readSheetMetrics(osmd, fitted);
        const boosted = continuousZoomBoost(
          zoom,
          draft,
          viewportW,
          viewportH || fitted.contentHeightPx * 2,
        );
        if (boosted != null) {
          zoom = boosted;
          applyPieceOsmdZoom(osmd, viewportW, zoom);
          osmd.render();
          fitted = fitOsmdHostToContent(host);
        }
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

    collectCursorSnapshots(wrap, wholeNotesToSeconds): CursorPose[] {
      if (!osmd) return [];
      const cursor = getCursor(osmd);
      if (!cursor) return [];
      return collectCursorSnapshotsFromWalk(cursor, wrap, wholeNotesToSeconds);
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
