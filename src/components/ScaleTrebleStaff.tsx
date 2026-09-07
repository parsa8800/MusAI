"use client";

import { useEffect, useRef, useState } from "react";
import type { ScaleKind } from "@/lib/scales";
import {
  chunkMidisForStaff,
  maxNotesPerStaffRow,
} from "@/lib/staffChunking";
import {
  SCALE_CLEAR_MISS_CENTS,
  SCALE_IN_TUNE_CENTS,
} from "@/lib/analyzeScalePerformance";
import {
  buildMidiToVexKeyMap,
  STAVE_HEADROOM_SPACES,
  STAVE_LINE_SPACING_PX,
  staveCanvasMetrics,
  vexKeySignatureSpec,
  vexKeysForMidisOrdered,
} from "@/lib/vexflowScaleSpelling";

type Props = {
  ascendingMidis: number[];
  descendingMidis: number[];
  /**
   * Visual feedback per step, aligned with the midi arrays above.
   * If omitted, renders plain notation.
   */
  ascendingCents?: Array<number | null>;
  descendingCents?: Array<number | null>;
  tonicPitchClass: number;
  scaleKind: ScaleKind;
  className?: string;
  /** Tighter vertical spacing for one-viewport pick mode. */
  density?: "default" | "pad";
  /** @deprecated Asc/desc are drawn as one continuous piece; labels are unused. */
  showSectionLabels?: boolean;
};

/** Theme-aware engraving colours for VexFlow. */
function notationThemeColors() {
  if (typeof window === "undefined") {
    return {
      fill: "#1c1917",
      stroke: "#b7aea3",
      bg: "#fffcf8",
    };
  }
  const s = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    s.getPropertyValue(name).trim() || fallback;
  return {
    fill: read("--musai-notation", read("--musai-ink", "#1c1917")),
    stroke: read("--musai-staff-line", "#b7aea3"),
    bg: read("--musai-surface", "#fffcf8"),
  };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function severity01FromAbsCents(absCents: number): number {
  return clamp01((absCents - SCALE_IN_TUNE_CENTS) / 50);
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

function noteInkForCents(cents: number | null): { fill: string; stroke: string } {
  if (cents === null) {
    const muted = cssVar("--musai-muted", "#78716c");
    return { fill: muted, stroke: muted };
  }
  const abs = Math.abs(cents);
  if (abs <= SCALE_IN_TUNE_CENTS) {
    const ok = cssVar("--musai-ok", "#3d7a5f");
    return { fill: ok, stroke: ok };
  }
  /* Sharp = warm amber; flat = cool slate — matches results legend. */
  if (cents > 0) {
    if (abs <= SCALE_CLEAR_MISS_CENTS) {
      const warn = cssVar("--musai-warn", "#b45309");
      return { fill: warn, stroke: warn };
    }
    const danger = cssVar("--musai-accent-2", "#c45c4a");
    return { fill: danger, stroke: danger };
  }
  if (abs <= SCALE_CLEAR_MISS_CENTS) {
    return { fill: "#6b8cce", stroke: "#6b8cce" };
  }
  return { fill: "#5a7ab0", stroke: "#5a7ab0" };
}

function drawSystem(
  VF: typeof import("vexflow"),
  host: HTMLDivElement,
  vexKeys: string[],
  keySig: string,
  staveWidth: number,
  options: {
    endBarSingle: boolean;
    cents?: Array<number | null>;
    lineSpacingPx?: number;
    noteHeadFontSize?: number;
    colors?: { fill: string; stroke: string; bg: string };
  },
) {
  const { Renderer, Stave, StaveNote, Formatter } = VF;
  const lineSpacing = options.lineSpacingPx ?? STAVE_LINE_SPACING_PX;
  const noteHeadFontSize = options.noteHeadFontSize ?? 39;
  const { fill: notationFill, stroke: notationStroke, bg: staveBg } =
    options.colors ?? notationThemeColors();
  const metricsDefaults = (VF as { MetricsDefaults?: { NoteHead?: { fontSize?: number } } }).MetricsDefaults;
  const metrics = (VF as { Metrics?: { clear?: (key: string) => void } }).Metrics;
  if (metricsDefaults) {
    metricsDefaults.NoteHead = { ...metricsDefaults.NoteHead, fontSize: noteHeadFontSize };
    metrics?.clear?.("NoteHead");
  }
  const BarlineType = VF.BarlineType;
  const endBar = BarlineType?.SINGLE ?? 1;
  const Annotation = (VF as any).Annotation as
    | (new (text: string) => any)
    | undefined;

  host.innerHTML = "";
  const { height, staveY } = staveCanvasMetrics(vexKeys, lineSpacing);
  const renderer = new Renderer(host, Renderer.Backends.SVG);
  renderer.resize(staveWidth, height);
  const ctx = renderer.getContext();
  ctx.setFillStyle(notationFill);
  ctx.setStrokeStyle(notationStroke);
  ctx.setBackgroundFillStyle(staveBg);
  ctx.setLineWidth(1.35);

  const stave = new Stave(16, staveY, staveWidth - 32, {
    spacingBetweenLinesPx: lineSpacing,
    spaceAboveStaffLn: STAVE_HEADROOM_SPACES,
    spaceBelowStaffLn: STAVE_HEADROOM_SPACES,
  });
  // Staff lines use stroke; clef / key use ink fill for contrast in both themes.
  stave.setStyle({ fillStyle: notationFill, strokeStyle: notationStroke });
  stave.setDefaultLedgerLineStyle({
    strokeStyle: notationStroke,
    lineWidth: 2.15,
  });
  stave.addClef("treble");
  stave.addKeySignature(keySig);
  if (options.endBarSingle) {
    stave.setEndBarType(endBar);
  }
  stave.setContext(ctx).draw();

  // Stems + noteheads share ink — never use staff-line grey for stems.
  const noteStyle = { fillStyle: notationFill, strokeStyle: notationFill };
  const centsForNotes = options.cents ? [...options.cents] : undefined;
  const notes = vexKeys.map((k, noteIdx) => {
    const n = new StaveNote({
      keys: [k],
      duration: "q",
      autoStem: true,
    });
    // Staff spacing is larger than VexFlow’s default; keep stems ~3.2 spaces tall.
    // setStemLength only stores an override — push it onto the Stem before draw.
    n.setStemLength(lineSpacing * 3.2);
    n.getStem()?.setExtension(n.getStemExtension());
    n.setLedgerLineStyle({
      strokeStyle: notationStroke,
      lineWidth: 2.25,
    });
    for (const head of n.noteHeads) {
      head.setFontSize(noteHeadFontSize);
    }
    const cents = centsForNotes?.[noteIdx];
    if (typeof cents === "number" || cents === null) {
      const ink = noteInkForCents(cents);
      n.setStyle({ fillStyle: ink.fill, strokeStyle: ink.stroke });
      try {
        n.getStem()?.setStyle({ fillStyle: ink.fill, strokeStyle: ink.stroke });
      } catch {
        /* ignore */
      }
      if (Annotation && typeof cents === "number" && Math.abs(cents) > SCALE_IN_TUNE_CENTS) {
        const arrow = cents > 0 ? "↑" : "↓";
        const ann = new Annotation(arrow);
        try {
          ann.setFont("system-ui", 14, "700");
        } catch {
          /* ignore */
        }
        try {
          const VJ = (Annotation as any).VerticalJustify;
          if (VJ) ann.setVerticalJustification(cents > 0 ? VJ.TOP : VJ.BOTTOM);
        } catch {
          /* ignore */
        }
        try {
          const s = severity01FromAbsCents(Math.abs(cents));
          const shift = 6 + Math.round(10 * s);
          ann.setYShift(cents > 0 ? -shift : shift);
        } catch {
          /* ignore */
        }
        try {
          ann.setStyle({ fillStyle: ink.fill, strokeStyle: ink.stroke });
        } catch {
          /* ignore */
        }
        try {
          n.addModifier(ann, 0);
        } catch {
          /* ignore */
        }
      }
    } else {
      n.setStyle(noteStyle);
      try {
        n.getStem()?.setStyle(noteStyle);
      } catch {
        /* ignore */
      }
    }
    return n;
  });

  Formatter.FormatAndDraw(ctx, stave, notes, {
    autoBeam: false,
    alignRests: false,
  });

  const svg = host.querySelector("svg");
  if (svg) {
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", String(height));
    svg.setAttribute("data-stave-width", String(staveWidth));
    svg.style.width = "100%";
    svg.style.height = "auto";
    svg.style.display = "block";
    svg.style.overflow = "visible";
    // VexFlow can leave stems/flags on default black — force theme ink.
    const ink = notationFill;
    svg.querySelectorAll("[fill], [stroke]").forEach((el) => {
      const fill = el.getAttribute("fill");
      const stroke = el.getAttribute("stroke");
      if (fill === "#000" || fill === "#000000" || fill === "black") {
        el.setAttribute("fill", ink);
      }
      if (stroke === "#000" || stroke === "#000000" || stroke === "black") {
        el.setAttribute("stroke", ink);
      }
    });
    svg.querySelectorAll(".vf-stem path, .vf-stem line").forEach((el) => {
      el.setAttribute("stroke", ink);
      const sw = Number(el.getAttribute("stroke-width") || "1");
      if (sw < 1.45) el.setAttribute("stroke-width", "1.55");
    });
  }
}

/**
 * Ledger lines: a touch shorter than the default head-width stretch, still
 * centered on the note (equal overhang left and right).
 */
function reshapeLedgerLines(svg: SVGSVGElement, stroke: string) {
  const ns = "http://www.w3.org/2000/svg";
  /** Horizontal overhang past each side of the notehead bbox. */
  const overhang = 2.5;
  for (const path of [...svg.querySelectorAll("path")]) {
    let box: DOMRect;
    try {
      box = path.getBBox();
    } catch {
      continue;
    }
    // Short horizontal strokes only — staff lines are much wider.
    if (box.width < 10 || box.width > 40 || box.height > 1.5) continue;
    const cx = box.x + box.width / 2;
    // Slightly shorter than a full notehead-wide ledger: ~88% of head + tiny pads.
    const half = Math.max(6.5, box.width * 0.44 + overhang);
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", String(cx - half));
    line.setAttribute("x2", String(cx + half));
    line.setAttribute("y1", String(box.y));
    line.setAttribute("y2", String(box.y));
    line.setAttribute("stroke", stroke);
    line.setAttribute("stroke-width", "2.1");
    line.setAttribute("stroke-linecap", "round");
    path.replaceWith(line);
  }
}

/** Crop leftover canvas so painted notation sits in the middle of the card. */
function cropSvgViewBoxToInk(svg: SVGSVGElement, inkPad = 22) {
  const canvasWidth = Number(svg.getAttribute("data-stave-width") || svg.viewBox.baseVal.width);
  const ctm = svg.getScreenCTM();
  if (!ctm || canvasWidth <= 0) return;
  const inv = ctm.inverse();
  let minY = Infinity;
  let maxY = -Infinity;
  const nodes = svg.querySelectorAll("path, line, ellipse, use, text");
  for (const node of nodes) {
    const r = node.getBoundingClientRect();
    if (r.width < 0.5 && r.height < 0.5) continue;
    const top = new DOMPoint(r.left, r.top).matrixTransform(inv);
    const bottom = new DOMPoint(r.left, r.bottom).matrixTransform(inv);
    const y0 = Math.min(top.y, bottom.y);
    const y1 = Math.max(top.y, bottom.y);
    // SMuFL <text> glyphs often report the full em-square; skip those.
    if (node.tagName.toLowerCase() === "text" && y1 - y0 > 90) continue;
    minY = Math.min(minY, y0);
    maxY = Math.max(maxY, y1);
  }
  if (!Number.isFinite(minY) || maxY <= minY) return;
  const height = Math.ceil(maxY - minY + 2 * inkPad);
  const y = minY - inkPad;
  svg.setAttribute("viewBox", `0 ${y} ${canvasWidth} ${height}`);
  svg.setAttribute("height", String(height));
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
}

function cropStaffSvgs(root: HTMLElement, inkPad = 22, stroke?: string) {
  const ledgerStroke = stroke ?? notationThemeColors().stroke;
  root.querySelectorAll<SVGSVGElement>("svg").forEach((svg) => {
    reshapeLedgerLines(svg, ledgerStroke);
    cropSvgViewBoxToInk(svg, inkPad);
  });
}

function fitPieceIntoHost(host: HTMLElement) {
  const piece = host.firstElementChild as HTMLElement | null;
  if (!piece) return;
  piece.style.transform = "";
  piece.style.marginBottom = "";
  piece.style.transformOrigin = "center center";
  const avail = host.clientHeight;
  const need = piece.scrollHeight;
  // Keep notation readable — never shrink below ~90%. Prefer scroll over tiny notes.
  if (avail > 8 && need > avail) {
    const s = Math.max(0.9, Math.min(1, (avail - 4) / need));
    if (s < 0.995) piece.style.transform = `scale(${s})`;
  }
}

/** One paper card; multiple systems stack inside like a continuous piece. */
function appendPieceStaffCard(
  wrap: HTMLElement,
  parts: Array<{ kind: "system"; draw: (svgHost: HTMLDivElement) => void }>,
  opts: { pad: boolean; systemGapClass: string },
) {
  const row = document.createElement("div");
  row.className = "musai-staff-row w-full max-w-full";
  const card = document.createElement("div");
  card.className = "musai-staff-card";
  const shimmer = document.createElement("div");
  shimmer.className = "musai-staff-card__shimmer";
  shimmer.setAttribute("aria-hidden", "true");
  const inner = document.createElement("div");
  inner.className = opts.pad
    ? "musai-staff-card__inner musai-staff-card__inner--pad"
    : "musai-staff-card__inner";
  const stack = document.createElement("div");
  const multiSystem = parts.length > 1;
  stack.className = `flex w-full flex-col ${
    multiSystem ? opts.systemGapClass : "gap-0"
  }`;

  card.appendChild(shimmer);
  card.appendChild(inner);
  inner.appendChild(stack);
  row.appendChild(card);
  wrap.appendChild(row);

  for (const part of parts) {
    const svgHost = document.createElement("div");
    svgHost.className = "musai-staff-svg-host";
    stack.appendChild(svgHost);
    part.draw(svgHost);
  }
}

export function ScaleTrebleStaff({
  ascendingMidis,
  descendingMidis,
  ascendingCents,
  descendingCents,
  tonicPitchClass,
  scaleKind,
  className = "",
  density = "default",
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [usableW, setUsableW] = useState(720);
  const [themeKey, setThemeKey] = useState("light");
  const pad = density === "pad";
  const hasAsc = ascendingMidis.length > 0;
  const hasDesc = descendingMidis.length > 0;
  const bothDirections = hasAsc && hasDesc;

  useEffect(() => {
    const syncTheme = () => {
      setThemeKey(
        document.documentElement.dataset.theme === "dark" ? "dark" : "light",
      );
    };
    syncTheme();
    const mo = new MutationObserver(syncTheme);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setUsableW(w);
      const host = hostRef.current;
      if (pad && host?.firstElementChild) fitPieceIntoHost(host);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pad]);

  const staveWidth = Math.max(
    pad ? 340 : 300,
    Math.floor(usableW - (pad ? 4 : 8)),
  );

  // Stable dependency keys so cents updates always redraw.
  const ascMidiKey = ascendingMidis.join(",");
  const descMidiKey = descendingMidis.join(",");
  const ascCentsKey = (ascendingCents ?? []).map((c) => (c === null ? "n" : c)).join(",");
  const descCentsKey = (descendingCents ?? []).map((c) => (c === null ? "n" : c)).join(",");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;

    void (async () => {
      try {
        await (document as any).fonts?.ready;
      } catch {
        /* ignore */
      }
      const VF = await import("vexflow");
      if (cancelled) return;

      try {
        await (document as any).fonts?.load?.("16px Bravura");
      } catch {
        /* ignore */
      }

      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (cancelled) return;

      const maxPerRow = maxNotesPerStaffRow(
        usableW,
        pad ? (bothDirections ? 30 : 40) : undefined,
      );
      const keySig = vexKeySignatureSpec(tonicPitchClass, scaleKind);

      const pieceMidis = [...ascendingMidis, ...descendingMidis];
      if (pieceMidis.length === 0) {
        host.innerHTML = "";
        return;
      }

      const midiToKey = buildMidiToVexKeyMap(
        pieceMidis,
        tonicPitchClass,
        scaleKind,
      );

      // Ascending and descending as separate staff lines in one piece card.
      type LineChunk = {
        midis: number[];
        cents?: Array<number | null>;
        direction: "up" | "down";
      };
      const lineChunks: LineChunk[] = [];

      if (ascendingMidis.length > 0) {
        const ascChunks = chunkMidisForStaff(ascendingMidis, maxPerRow);
        let offset = 0;
        for (const chunk of ascChunks) {
          lineChunks.push({
            midis: chunk,
            cents: ascendingCents
              ? ascendingCents.slice(offset, offset + chunk.length)
              : undefined,
            direction: "up",
          });
          offset += chunk.length;
        }
      }
      if (descendingMidis.length > 0) {
        const descChunks = chunkMidisForStaff(descendingMidis, maxPerRow);
        let offset = 0;
        for (const chunk of descChunks) {
          lineChunks.push({
            midis: chunk,
            cents: descendingCents
              ? descendingCents.slice(offset, offset + chunk.length)
              : undefined,
            direction: "down",
          });
          offset += chunk.length;
        }
      }

      const longAsc = ascendingMidis.length > 10;
      const drawOpts = pad
        ? bothDirections
          ? { lineSpacingPx: longAsc ? 14 : 16, noteHeadFontSize: longAsc ? 34 : 38 }
          : {
              lineSpacingPx: longAsc ? 16 : 18,
              noteHeadFontSize: longAsc ? 36 : 42,
            }
        : { lineSpacingPx: STAVE_LINE_SPACING_PX, noteHeadFontSize: 39 };

      // 2-octave up/down needs a wide gap — high ledger notes almost touch otherwise.
      const systemGapClass = bothDirections
        ? longAsc
          ? pad
            ? "gap-8 sm:gap-10"
            : "gap-8 sm:gap-12"
          : pad
            ? "gap-4 sm:gap-5"
            : "gap-3 sm:gap-4"
        : "gap-0";

      host.innerHTML = "";
      const pieceWrap = document.createElement("div");
      pieceWrap.className = "w-full";
      const colors = notationThemeColors();

      const parts: Array<{
        kind: "system";
        draw: (svgHost: HTMLDivElement) => void;
      }> = [];

      lineChunks.forEach((line, idx) => {
        const keys = vexKeysForMidisOrdered(
          line.midis,
          midiToKey,
          tonicPitchClass,
          scaleKind,
        );
        parts.push({
          kind: "system",
          draw: (svgHost: HTMLDivElement) =>
            drawSystem(VF, svgHost, keys, keySig, staveWidth, {
              endBarSingle: idx < lineChunks.length - 1,
              cents: line.cents ? [...line.cents] : undefined,
              colors,
              ...drawOpts,
            }),
        });
      });

      appendPieceStaffCard(pieceWrap, parts, { pad, systemGapClass });
      host.appendChild(pieceWrap);
      requestAnimationFrame(() => {
        if (cancelled) return;
        cropStaffSvgs(
          host,
          pad ? (longAsc && bothDirections ? 14 : 10) : 22,
          colors.stroke,
        );
        requestAnimationFrame(() => {
          if (cancelled || !pad) return;
          fitPieceIntoHost(host);
        });
      });
    })();

    return () => {
      cancelled = true;
      host.innerHTML = "";
    };
  }, [
    ascMidiKey,
    descMidiKey,
    ascCentsKey,
    descCentsKey,
    ascendingMidis,
    descendingMidis,
    ascendingCents,
    descendingCents,
    pad,
    bothDirections,
    scaleKind,
    staveWidth,
    tonicPitchClass,
    usableW,
    themeKey,
  ]);

  return (
    <div
      ref={wrapRef}
      className={`min-h-0 w-full ${pad ? "h-auto max-h-full" : "h-full"} ${className}`}
    >
      <div
        ref={hostRef}
        className={`flex min-h-0 w-full justify-center overflow-x-hidden ${
          pad
            ? "h-auto max-h-full items-start overflow-y-auto"
            : "h-full items-center overflow-y-auto"
        }`}
        aria-label={
          bothDirections
            ? "Scale notes, ascending then descending"
            : hasAsc
              ? "Scale notes, ascending"
              : hasDesc
                ? "Scale notes, descending"
                : "Scale notes"
        }
      />
    </div>
  );
}
