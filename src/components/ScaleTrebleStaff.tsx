"use client";

import { useEffect, useRef, useState } from "react";
import type { ScaleKind } from "@/lib/scales";
import {
  chunkMidisForStaffPaired,
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
};

/** Warm ink on paper staff. */
const NOTATION_FILL = "#1c1917";
/** Staff lines and notehead rims. */
const NOTATION_STROKE = "#c4bdb4";
/** Paper surface behind the staff SVG. */
const STAVE_BG = "#fffcf8";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function severity01FromAbsCents(absCents: number): number {
  return clamp01((absCents - SCALE_IN_TUNE_CENTS) / 50);
}

function noteInkForCents(cents: number | null): { fill: string; stroke: string } {
  if (cents === null) {
    return { fill: "rgba(120,113,108,0.55)", stroke: "rgba(120,113,108,0.55)" };
  }
  const abs = Math.abs(cents);
  if (abs <= SCALE_IN_TUNE_CENTS) {
    return { fill: "#3d7a5f", stroke: "#3d7a5f" };
  }
  /* Sharp = warm amber; flat = cool slate — matches results legend. */
  if (cents > 0) {
    if (abs <= SCALE_CLEAR_MISS_CENTS) {
      return { fill: "#b45309", stroke: "#b45309" };
    }
    return { fill: "#c45c4a", stroke: "#c45c4a" };
  }
  if (abs <= SCALE_CLEAR_MISS_CENTS) {
    return { fill: "#4a6fa5", stroke: "#4a6fa5" };
  }
  return { fill: "#3d5a80", stroke: "#3d5a80" };
}

function drawSystem(
  VF: typeof import("vexflow"),
  host: HTMLDivElement,
  vexKeys: string[],
  keySig: string,
  staveWidth: number,
  options: { endBarSingle: boolean; cents?: Array<number | null> },
) {
  const { Renderer, Stave, StaveNote, Formatter } = VF;
  const metricsDefaults = (VF as { MetricsDefaults?: { NoteHead?: { fontSize?: number } } }).MetricsDefaults;
  const metrics = (VF as { Metrics?: { clear?: (key: string) => void } }).Metrics;
  if (metricsDefaults) {
    metricsDefaults.NoteHead = { ...metricsDefaults.NoteHead, fontSize: 39 };
    metrics?.clear?.("NoteHead");
  }
  const BarlineType = VF.BarlineType;
  const endBar = BarlineType?.SINGLE ?? 1;
  const Annotation = (VF as any).Annotation as
    | (new (text: string) => any)
    | undefined;

  host.innerHTML = "";
  const { height, staveY } = staveCanvasMetrics(vexKeys, STAVE_LINE_SPACING_PX);
  const renderer = new Renderer(host, Renderer.Backends.SVG);
  renderer.resize(staveWidth, height);
  const ctx = renderer.getContext();
  ctx.setFillStyle(NOTATION_FILL);
  ctx.setStrokeStyle(NOTATION_STROKE);
  ctx.setBackgroundFillStyle(STAVE_BG);
  ctx.setLineWidth(1.25);

  const stave = new Stave(16, staveY, staveWidth - 32, {
    spacingBetweenLinesPx: STAVE_LINE_SPACING_PX,
    spaceAboveStaffLn: STAVE_HEADROOM_SPACES,
    spaceBelowStaffLn: STAVE_HEADROOM_SPACES,
  });
  stave.setStyle({ fillStyle: NOTATION_FILL, strokeStyle: NOTATION_STROKE });
  stave.setDefaultLedgerLineStyle({
    strokeStyle: NOTATION_STROKE,
    lineWidth: 2,
  });
  stave.addClef("treble");
  stave.addKeySignature(keySig);
  if (options.endBarSingle) {
    stave.setEndBarType(endBar);
  }
  stave.setContext(ctx).draw();

  const noteStyle = { fillStyle: NOTATION_FILL, strokeStyle: NOTATION_STROKE };
  const centsForNotes = options.cents ? [...options.cents] : undefined;
  const notes = vexKeys.map((k, noteIdx) => {
    const n = new StaveNote({
      keys: [k],
      duration: "q",
      autoStem: true,
    });
    // Staff spacing is larger than VexFlow’s default; keep stems ~3.2 spaces tall.
    // setStemLength only stores an override — push it onto the Stem before draw.
    n.setStemLength(STAVE_LINE_SPACING_PX * 3.2);
    n.getStem()?.setExtension(n.getStemExtension());
    n.setLedgerLineStyle({
      strokeStyle: NOTATION_STROKE,
      lineWidth: 2.1,
    });
    for (const head of n.noteHeads) {
      head.setFontSize(39);
    }
    const cents = centsForNotes?.[noteIdx];
    if (typeof cents === "number" || cents === null) {
      const ink = noteInkForCents(cents);
      n.setStyle({ fillStyle: ink.fill, strokeStyle: ink.stroke });
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
  }
}

/**
 * Ledger lines: a touch shorter than the default head-width stretch, still
 * centered on the note (equal overhang left and right).
 */
function reshapeLedgerLines(svg: SVGSVGElement) {
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
    line.setAttribute("stroke", NOTATION_STROKE);
    line.setAttribute("stroke-width", "2.1");
    line.setAttribute("stroke-linecap", "round");
    path.replaceWith(line);
  }
}

/** Crop leftover canvas so painted notation sits in the middle of the card. */
function cropSvgViewBoxToInk(svg: SVGSVGElement) {
  const pad = 22;
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
  const height = Math.ceil(maxY - minY + 2 * pad);
  const y = minY - pad;
  svg.setAttribute("viewBox", `0 ${y} ${canvasWidth} ${height}`);
  svg.setAttribute("height", String(height));
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
}

function cropStaffSvgs(root: HTMLElement) {
  root.querySelectorAll<SVGSVGElement>("svg").forEach((svg) => {
    reshapeLedgerLines(svg);
    cropSvgViewBoxToInk(svg);
  });
}

function appendGlassStaffRow(
  wrap: HTMLElement,
  drawIntoHost: (svgHost: HTMLDivElement) => void,
) {
  const row = document.createElement("div");
  row.className = "musai-staff-row w-full max-w-full";
  const card = document.createElement("div");
  card.className = "musai-staff-card";
  const shimmer = document.createElement("div");
  shimmer.className = "musai-staff-card__shimmer";
  shimmer.setAttribute("aria-hidden", "true");
  const inner = document.createElement("div");
  inner.className = "musai-staff-card__inner";
  const svgHost = document.createElement("div");
  svgHost.className = "musai-staff-svg-host";
  card.appendChild(shimmer);
  card.appendChild(inner);
  inner.appendChild(svgHost);
  row.appendChild(card);
  wrap.appendChild(row);
  drawIntoHost(svgHost);
}

export function ScaleTrebleStaff({
  ascendingMidis,
  descendingMidis,
  ascendingCents,
  descendingCents,
  tonicPitchClass,
  scaleKind,
  className = "",
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const ascHostRef = useRef<HTMLDivElement>(null);
  const descHostRef = useRef<HTMLDivElement>(null);
  const [usableW, setUsableW] = useState(720);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setUsableW(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const staveWidth = Math.max(280, Math.floor(usableW - 8));

  // Stable dependency keys so cents updates always redraw.
  const ascMidiKey = ascendingMidis.join(",");
  const descMidiKey = descendingMidis.join(",");
  const ascCentsKey = (ascendingCents ?? []).map((c) => (c === null ? "n" : c)).join(",");
  const descCentsKey = (descendingCents ?? []).map((c) => (c === null ? "n" : c)).join(",");

  useEffect(() => {
    const ascHost = ascHostRef.current;
    const descHost = descHostRef.current;
    if (!ascHost || !descHost) return;

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

      const maxPerRow = maxNotesPerStaffRow(usableW);
      const keySig = vexKeySignatureSpec(tonicPitchClass, scaleKind);
      const midiToKey = buildMidiToVexKeyMap(
        ascendingMidis,
        tonicPitchClass,
        scaleKind,
      );
      const { ascending: ascChunks, descending: descChunks } =
        chunkMidisForStaffPaired(ascendingMidis, descendingMidis, maxPerRow);

      ascHost.innerHTML = "";
      descHost.innerHTML = "";

      const ascWrap = document.createElement("div");
      ascWrap.className = "flex w-full flex-col gap-7 sm:gap-8";
      ascChunks.forEach((chunk, idx) => {
        const startIndex = ascChunks
          .slice(0, idx)
          .reduce((s, c) => s + c.length, 0);
        const centsSlice = ascendingCents
          ? ascendingCents.slice(startIndex, startIndex + chunk.length)
          : undefined;
        const keys = vexKeysForMidisOrdered(
          chunk,
          midiToKey,
          tonicPitchClass,
          scaleKind,
        );
        appendGlassStaffRow(ascWrap, (svgHost) =>
          drawSystem(VF, svgHost, keys, keySig, staveWidth, {
            endBarSingle: idx < ascChunks.length - 1,
            cents: centsSlice ? [...centsSlice] : undefined,
          }),
        );
      });
      ascHost.appendChild(ascWrap);

      const descWrap = document.createElement("div");
      descWrap.className = "flex w-full flex-col gap-7 sm:gap-8";
      descChunks.forEach((chunk, idx) => {
        const startIndex = descChunks
          .slice(0, idx)
          .reduce((s, c) => s + c.length, 0);
        const centsSlice = descendingCents
          ? descendingCents.slice(startIndex, startIndex + chunk.length)
          : undefined;
        const keys = vexKeysForMidisOrdered(
          chunk,
          midiToKey,
          tonicPitchClass,
          scaleKind,
        );
        appendGlassStaffRow(descWrap, (svgHost) =>
          drawSystem(VF, svgHost, keys, keySig, staveWidth, {
            endBarSingle: idx < descChunks.length - 1,
            cents: centsSlice ? [...centsSlice] : undefined,
          }),
        );
      });
      descHost.appendChild(descWrap);
      requestAnimationFrame(() => {
        if (cancelled) return;
        cropStaffSvgs(ascHost);
        cropStaffSvgs(descHost);
      });
    })();

    return () => {
      cancelled = true;
      ascHost.innerHTML = "";
      descHost.innerHTML = "";
    };
    // Keys capture midi/cents identity; arrays themselves are listed for eslint clarity.
  }, [
    ascMidiKey,
    descMidiKey,
    ascCentsKey,
    descCentsKey,
    ascendingMidis,
    descendingMidis,
    ascendingCents,
    descendingCents,
    scaleKind,
    staveWidth,
    tonicPitchClass,
    usableW,
  ]);

  const hasAsc = ascendingMidis.length > 0;
  const hasDesc = descendingMidis.length > 0;

  return (
    <div ref={wrapRef} className={`w-full ${className}`}>
      <div className="flex w-full flex-col gap-12 sm:gap-14">
        <div className={`w-full space-y-4 ${hasAsc ? "" : "sr-only"}`}>
          <p className="musai-staff-section-label text-center text-[11px] font-semibold uppercase">
            Ascending
          </p>
          <div ref={ascHostRef} className="min-h-[96px] w-full" />
        </div>
        <div className={`w-full space-y-4 ${hasDesc ? "" : "sr-only"}`}>
          <p className="musai-staff-section-label text-center text-[11px] font-semibold uppercase">
            Descending
          </p>
          <div ref={descHostRef} className="min-h-[96px] w-full" />
        </div>
      </div>
    </div>
  );
}
