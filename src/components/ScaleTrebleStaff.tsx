"use client";

import { useEffect, useRef, useState } from "react";
import type { ScaleKind } from "@/lib/scales";
import {
  notationEngravingPlan,
  notationFitFromBoxes,
  notationFitLayoutShift,
  notationFitScale,
  notationViewBoxFromInk,
  unionClientBoxes,
} from "@/lib/notationFit";
import { chunkMidisForStaff } from "@/lib/staffChunking";
import {
  SCALE_CLEAR_MISS_CENTS,
  SCALE_IN_TUNE_CENTS,
} from "@/lib/analyzeScalePerformance";
import { pitchCorrectionArrow, pitchCorrectionDir } from "@/lib/scaleNoteVisual";
import {
  buildMidiToVexKeyMap,
  STAVE_HEADROOM_SPACES,
  STAVE_LINE_SPACING_PX,
  staveCanvasMetrics,
  vexKeySignatureSpec,
  vexKeysForMidisOrdered,
} from "@/lib/vexflowScaleSpelling";

/** Host inset so stems, clefs, and arrows never kiss the clip edge. */
const NOTATION_HOST_INK_INSET_PX = 5;

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
  /**
   * Prefer one system per direction. Width still wins: if the phrase cannot
   * fit, it reflows at octave boundaries so nothing is clipped.
   */
  keepPhrasesWhole?: boolean;
  /**
   * `preview` = guide notation before a take (muted ink, no pitch colours).
   * Same VexFlow/Bravura engraving as live results.
   */
  appearance?: "live" | "preview";
  /** @deprecated Asc/desc are drawn as one continuous piece; labels are unused. */
  showSectionLabels?: boolean;
};

/** Theme-aware engraving colours for VexFlow. */
function notationThemeColors(appearance: "live" | "preview" = "live") {
  if (typeof window === "undefined") {
    return {
      fill: appearance === "preview" ? "#a8a29e" : "#1c1917",
      stroke: "#b7aea3",
      bg: "#fffcf8",
    };
  }
  const s = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    s.getPropertyValue(name).trim() || fallback;
  const liveFill = read("--musai-notation", read("--musai-ink", "#1c1917"));
  const muted = read("--musai-muted", "#78716c");
  return {
    // Preview: soft but readable — kids should recognise real notes, not ink blotches.
    fill: appearance === "preview" ? muted : liveFill,
    stroke:
      appearance === "preview"
        ? read("--musai-staff-line", "#c4bbb0")
        : read("--musai-staff-line", "#b7aea3"),
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
    const miss = cssVar("--musai-pitch-miss", cssVar("--musai-muted", "#78716c"));
    return { fill: miss, stroke: miss };
  }
  const abs = Math.abs(cents);
  if (abs <= SCALE_IN_TUNE_CENTS) {
    const ok = cssVar("--musai-pitch-ok", cssVar("--musai-ok", "#2f8a62"));
    return { fill: ok, stroke: ok };
  }
  if (cents > 0) {
    const high =
      abs <= SCALE_CLEAR_MISS_CENTS
        ? cssVar("--musai-pitch-high", cssVar("--musai-warn", "#d4891a"))
        : cssVar("--musai-pitch-high-strong", cssVar("--musai-accent-2", "#c45c4a"));
    return { fill: high, stroke: high };
  }
  const low =
    abs <= SCALE_CLEAR_MISS_CENTS
      ? cssVar("--musai-pitch-low", "#3d6ec9")
      : cssVar("--musai-pitch-low-strong", "#2f5aa8");
  return { fill: low, stroke: low };
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
      if (Annotation && typeof cents === "number") {
        const fix = pitchCorrectionDir(cents);
        if (fix) {
          const goUp = fix === "up";
          const ann = new Annotation(pitchCorrectionArrow(fix));
          try {
            ann.setFont("system-ui", 22, "800");
          } catch {
            /* ignore */
          }
          try {
            const VJ = (Annotation as any).VerticalJustify;
            if (VJ) ann.setVerticalJustification(goUp ? VJ.TOP : VJ.BOTTOM);
          } catch {
            /* ignore */
          }
          try {
            const s = severity01FromAbsCents(Math.abs(cents));
            const shift = 6 + Math.round(10 * s);
            ann.setYShift(goUp ? -shift : shift);
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

/**
 * Expand the viewBox to every painted mark (clef, heads, stems, arrows).
 * Uses SVG getBBox (user space) so a clipped parent during measure cannot
 * shrink the viewBox and permanently cut stems.
 */
function cropSvgViewBoxToInk(svg: SVGSVGElement, inkPad = 22) {
  const canvasWidth = Number(
    svg.getAttribute("data-stave-width") || svg.viewBox.baseVal.width,
  );
  if (!(canvasWidth > 0)) return;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const nodes = svg.querySelectorAll("path, line, ellipse, use, text");
  for (const node of nodes) {
    const el = node as SVGGraphicsElement;
    if (typeof el.getBBox !== "function") continue;
    let box: DOMRect;
    try {
      box = el.getBBox();
    } catch {
      continue;
    }
    if (!Number.isFinite(box.x) || !Number.isFinite(box.y)) continue;
    const stroke = Number(el.getAttribute("stroke-width") || "0");
    const strokePad = Number.isFinite(stroke) ? stroke / 2 : 0;
    // Vertical stems are zero-width paths; still count them.
    if (box.width + box.height < 0.25 && strokePad < 0.25) continue;
    const x0 = box.x - strokePad;
    const x1 = box.x + box.width + strokePad;
    const y0 = box.y - strokePad;
    const y1 = box.y + box.height + strokePad;
    if (node.tagName.toLowerCase() === "text" && y1 - y0 > 90) continue;
    minX = Math.min(minX, x0);
    maxX = Math.max(maxX, x1);
    minY = Math.min(minY, y0);
    maxY = Math.max(maxY, y1);
  }
  const view = notationViewBoxFromInk(
    canvasWidth,
    { minX, minY, maxX, maxY },
    inkPad + 8,
  );
  if (!view) return;
  svg.setAttribute(
    "viewBox",
    `${view.x} ${view.y} ${view.width} ${view.height}`,
  );
  svg.setAttribute("height", String(view.height));
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  // ViewBox now contains every mark, so clip to the SVG box instead of painting
  // stems/arrows into a parent that later hides overflow.
  svg.style.overflow = "hidden";
}

function cropStaffSvgs(root: HTMLElement, inkPad = 22, stroke?: string) {
  const ledgerStroke = stroke ?? notationThemeColors().stroke;
  root.querySelectorAll<SVGSVGElement>("svg").forEach((svg) => {
    reshapeLedgerLines(svg, ledgerStroke);
    cropSvgViewBoxToInk(svg, inkPad);
  });
}

function paintedClientBoxes(root: HTMLElement) {
  const boxes = [];
  // Music fonts use <text> with a huge em-box; that is not the painted glyph.
  const nodes = root.querySelectorAll(
    "svg, svg path, svg line, svg ellipse, svg use",
  );
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (rect.width + rect.height < 0.25) continue;
    boxes.push({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    });
  }
  return boxes;
}

function fitPieceIntoHost(host: HTMLElement) {
  const piece = host.firstElementChild as HTMLElement | null;
  if (!piece) return;
  piece.style.transform = "";
  piece.style.marginRight = "";
  piece.style.marginBottom = "";
  piece.removeAttribute("data-notation-scale");
  const availW = host.clientWidth;
  const availH = host.clientHeight;
  if (availW < 1 || availH < 1) return;
  const needW = Math.max(piece.scrollWidth, piece.offsetWidth);
  const needH = Math.max(piece.scrollHeight, piece.offsetHeight);
  const hostBox = host.getBoundingClientRect();
  const painted = unionClientBoxes(paintedClientBoxes(host));
  const layoutScale = notationFitScale(availW, availH, needW, needH);
  const inkScale = painted
    ? notationFitFromBoxes(
        {
          left: hostBox.left,
          top: hostBox.top,
          right: hostBox.right,
          bottom: hostBox.bottom,
        },
        painted,
        NOTATION_HOST_INK_INSET_PX,
      )
    : 1;
  const scale = Math.min(layoutScale, inkScale);
  const shift = notationFitLayoutShift(scale, needW, needH);
  piece.dataset.notationScale = scale.toFixed(3);
  if (scale >= 0.995) return;
  piece.style.transformOrigin = "top left";
  piece.style.transform = `scale(${scale})`;
  piece.style.marginRight = `${shift.marginRight}px`;
  piece.style.marginBottom = `${shift.marginBottom}px`;
}

/** One paper card; multiple systems stack inside like a continuous piece. */
function appendPieceStaffCard(
  wrap: HTMLElement,
  parts: Array<{ kind: "system"; draw: (svgHost: HTMLDivElement) => void }>,
  opts: { pad: boolean; systemGapClass: string; preview?: boolean },
) {
  const row = document.createElement("div");
  row.className = "musai-staff-row w-full max-w-full";
  const card = document.createElement("div");
  card.className = opts.preview
    ? "musai-staff-card musai-staff-card--preview"
    : "musai-staff-card";
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
  keepPhrasesWhole = false,
  appearance = "live",
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [usableW, setUsableW] = useState(0);
  const [usableH, setUsableH] = useState(0);
  const [themeKey, setThemeKey] = useState("light");
  const pad = density === "pad";
  const preview = appearance === "preview";
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
    const wrap = wrapRef.current;
    const host = hostRef.current;
    if (!wrap) return;
    const measure = () => {
      const box = wrap.getBoundingClientRect();
      if (box.width > 0) setUsableW(box.width);
      if (box.height > 0) setUsableH(box.height);
      if (host?.firstElementChild) fitPieceIntoHost(host);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    if (host) ro.observe(host);
    return () => ro.disconnect();
  }, []);

  const staveWidth = Math.max(
    200,
    Math.floor(usableW - (pad ? 8 : 16)),
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
        await Promise.race([
          (document as Document).fonts?.ready ?? Promise.resolve(),
          new Promise<void>((r) => {
            setTimeout(r, 500);
          }),
        ]);
      } catch {
        /* ignore */
      }
      const VF = await import("vexflow");
      if (cancelled) return;

      try {
        await Promise.race([
          (document as Document).fonts?.load?.("16px Bravura") ?? Promise.resolve(),
          new Promise<void>((r) => {
            setTimeout(r, 400);
          }),
        ]);
      } catch {
        /* ignore */
      }

      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (cancelled) return;

      const measuredW = Math.max(
        usableW,
        Math.floor(
          wrapRef.current?.getBoundingClientRect().width ||
            host.getBoundingClientRect().width ||
            0,
        ),
      );
      const measuredH = Math.max(
        usableH,
        Math.floor(
          wrapRef.current?.getBoundingClientRect().height ||
            host.getBoundingClientRect().height ||
            0,
        ),
      );
      const pieceMidis = [...ascendingMidis, ...descendingMidis];
      if (pieceMidis.length === 0 || measuredW < 40) {
        host.innerHTML = "";
        return;
      }

      const plan = notationEngravingPlan({
        availableWidth: measuredW,
        availableHeight: measuredH,
        ascendingMidis,
        descendingMidis,
        pad,
      });
      const maxPerRow = plan.maxPerRow;
      const keySig = vexKeySignatureSpec(tonicPitchClass, scaleKind);
      const drawWidth = Math.max(200, Math.floor(measuredW - (pad ? 8 : 16)));

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

      const drawOpts = {
        lineSpacingPx: plan.lineSpacingPx,
        noteHeadFontSize: plan.noteHeadFontSize,
      };
      const systemGapClass = plan.systemGapClass;

      host.innerHTML = "";
      const pieceWrap = document.createElement("div");
      pieceWrap.className = "musai-staff-piece w-full";
      const colors = notationThemeColors(appearance);

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
            drawSystem(VF, svgHost, keys, keySig, drawWidth, {
              endBarSingle: idx < lineChunks.length - 1,
              // Preview never shows pitch-coloured feedback.
              cents: preview ? undefined : line.cents ? [...line.cents] : undefined,
              colors,
              ...drawOpts,
            }),
        });
      });

      appendPieceStaffCard(pieceWrap, parts, { pad, systemGapClass, preview });
      host.appendChild(pieceWrap);
      requestAnimationFrame(() => {
        if (cancelled) return;
        cropStaffSvgs(host, plan.inkPad, colors.stroke);
        requestAnimationFrame(() => {
          if (cancelled) return;
          fitPieceIntoHost(host);
          requestAnimationFrame(() => {
            if (cancelled) return;
            fitPieceIntoHost(host);
          });
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
    keepPhrasesWhole,
    scaleKind,
    staveWidth,
    tonicPitchClass,
    usableW,
    usableH,
    themeKey,
    appearance,
    preview,
  ]);

  return (
    <div
      ref={wrapRef}
      className={`musai-notation-wrap min-h-0 min-w-0 w-full max-w-full overflow-hidden ${pad ? "h-full max-h-full" : "h-full"} ${
        preview ? "musai-staff-preview" : ""
      } ${className}`}
      data-appearance={appearance}
    >
      <div
        ref={hostRef}
        className="musai-notation-host musai-scroll flex h-full max-h-full min-h-0 w-full items-start justify-center overflow-hidden"
        data-testid="scale-notation-host"
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
