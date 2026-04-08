"use client";

import { useEffect, useRef, useState } from "react";
import type { ScaleKind } from "@/lib/scales";
import {
  chunkMidisForStaffPaired,
  maxNotesPerStaffRow,
} from "@/lib/staffChunking";
import {
  buildMidiToVexKeyMap,
  vexKeySignatureSpec,
  vexKeysForMidisOrdered,
} from "@/lib/vexflowScaleSpelling";

type Props = {
  ascendingMidis: number[];
  descendingMidis: number[];
  tonicPitchClass: number;
  scaleKind: ScaleKind;
  className?: string;
};

/** Slightly luminous ink; stroke a touch softer for dimensional noteheads. */
const NOTATION_FILL = "#f7f7ff";
/** Shared stroke: crisp enough for staff lines, soft enough for notehead rims. */
const NOTATION_STROKE = "#d4d8ea";
/** Deep cool panel behind the staff (visible at SVG edges). */
const STAVE_BG = "rgba(14,16,24,0.97)";

function drawSystem(
  VF: typeof import("vexflow"),
  host: HTMLDivElement,
  vexKeys: string[],
  keySig: string,
  staveWidth: number,
  options: { endBarSingle: boolean },
) {
  const { Renderer, Stave, StaveNote, Formatter } = VF;
  const BarlineType = VF.BarlineType;
  const endBar = BarlineType?.SINGLE ?? 1;

  host.innerHTML = "";
  const height = 172;
  const renderer = new Renderer(host, Renderer.Backends.SVG);
  renderer.resize(staveWidth, height);
  const ctx = renderer.getContext();
  ctx.setFillStyle(NOTATION_FILL);
  ctx.setStrokeStyle(NOTATION_STROKE);
  ctx.setBackgroundFillStyle(STAVE_BG);
  ctx.setLineWidth(1.15);

  const stave = new Stave(12, 30, staveWidth - 24);
  stave.setStyle({ fillStyle: NOTATION_FILL, strokeStyle: NOTATION_STROKE });
  stave.addClef("treble");
  stave.addKeySignature(keySig);
  if (options.endBarSingle) {
    stave.setEndBarType(endBar);
  }
  stave.setContext(ctx).draw();

  const noteStyle = { fillStyle: NOTATION_FILL, strokeStyle: NOTATION_STROKE };
  const notes = vexKeys.map((k) => {
    const n = new StaveNote({
      keys: [k],
      duration: "q",
      autoStem: true,
    });
    n.setStyle(noteStyle);
    return n;
  });

  Formatter.FormatAndDraw(ctx, stave, notes, {
    autoBeam: false,
    alignRests: false,
  });
}

function appendGlassStaffRow(
  wrap: HTMLElement,
  drawIntoHost: (svgHost: HTMLDivElement) => void,
) {
  const row = document.createElement("div");
  row.className =
    "w-full max-w-full overflow-x-auto pb-0.5 [scrollbar-width:thin]";
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

  useEffect(() => {
    const ascHost = ascHostRef.current;
    const descHost = descHostRef.current;
    if (!ascHost || !descHost) return;

    let cancelled = false;

    void (async () => {
      await document.fonts.ready;
      const VF = await import("vexflow");
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
      ascWrap.className = "flex flex-col items-center gap-7 sm:gap-8";
      ascChunks.forEach((chunk, idx) => {
        const keys = vexKeysForMidisOrdered(
          chunk,
          midiToKey,
          tonicPitchClass,
          scaleKind,
        );
        appendGlassStaffRow(ascWrap, (svgHost) =>
          drawSystem(VF, svgHost, keys, keySig, staveWidth, {
            endBarSingle: idx < ascChunks.length - 1,
          }),
        );
      });
      ascHost.appendChild(ascWrap);

      const descWrap = document.createElement("div");
      descWrap.className = "flex flex-col items-center gap-7 sm:gap-8";
      descChunks.forEach((chunk, idx) => {
        const keys = vexKeysForMidisOrdered(
          chunk,
          midiToKey,
          tonicPitchClass,
          scaleKind,
        );
        appendGlassStaffRow(descWrap, (svgHost) =>
          drawSystem(VF, svgHost, keys, keySig, staveWidth, {
            endBarSingle: idx < descChunks.length - 1,
          }),
        );
      });
      descHost.appendChild(descWrap);
    })();

    return () => {
      cancelled = true;
      ascHost.innerHTML = "";
      descHost.innerHTML = "";
    };
  }, [
    ascendingMidis,
    descendingMidis,
    scaleKind,
    staveWidth,
    tonicPitchClass,
    usableW,
  ]);

  const hasAsc = ascendingMidis.length > 0;
  const hasDesc = descendingMidis.length > 0;

  return (
    <div ref={wrapRef} className={`w-full ${className}`}>
      <div className="flex flex-col gap-16 sm:gap-20">
        <div className={`space-y-6 ${hasAsc ? "" : "sr-only"}`}>
          <p className="musai-staff-section-label text-center text-[10px] font-semibold uppercase">
            Ascending
          </p>
          <div ref={ascHostRef} className="min-h-[96px]" />
        </div>
        <div className={`space-y-6 ${hasDesc ? "" : "sr-only"}`}>
          <p className="musai-staff-section-label text-center text-[10px] font-semibold uppercase">
            Descending
          </p>
          <div ref={descHostRef} className="min-h-[96px]" />
        </div>
      </div>
    </div>
  );
}
