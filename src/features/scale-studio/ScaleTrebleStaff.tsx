"use client";

import { useEffect, useRef, useState } from "react";
import { useInstrument } from "@/components/InstrumentProvider";
import {
  clefForNotes,
  stringFingerLabel,
} from "@/lib/instrument";
import type { ScaleKind } from "@/lib/scales";
import { notationEngravingPlan } from "@/lib/notationFit";
import { chunkMidisForStaff } from "@/lib/staffChunking";
import {
  buildMidiToVexKeyMap,
  STAVE_LINE_SPACING_PX,
  vexKeySignatureSpec,
  vexKeysForMidisOrdered,
} from "@/lib/vexflowScaleSpelling";
import {
  FINGER_LABEL_PAD_PX,
  appendPieceStaffCard,
  cropStaffSvgs,
  drawSystem,
  fitPieceIntoHost,
  notationThemeColors,
} from "@/features/scale-studio/scaleTrebleStaffSvg";

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
  /** String+finger labels (A2) above each note. Off unless the player opts in. */
  showFingerings?: boolean;
};

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
  showFingerings = false,
}: Props) {
  const { instrument } = useInstrument();
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const heightRef = useRef(0);
  const [usableW, setUsableW] = useState(0);
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
    let lastW = 0;
    const measure = () => {
      const frame = wrap.parentElement;
      const wrapH = wrap.clientHeight || wrap.getBoundingClientRect().height;
      const frameH = frame?.clientHeight || 0;
      const h = Math.floor(wrapH >= 48 ? wrapH : frameH);
      const w = Math.floor(
        wrap.clientWidth ||
          frame?.clientWidth ||
          wrap.getBoundingClientRect().width,
      );
      // Ignore the collapsed frame left behind when a redraw clears the SVG.
      if (w < 40 || h < 48) return;
      heightRef.current = h;
      // Height changes only refit the existing engraving. A new height must
      // not clear and redraw the notes — that feedback is the up/down jump.
      if (Math.abs(w - lastW) < 8) {
        if (host?.firstElementChild) fitPieceIntoHost(host);
        return;
      }
      lastW = w;
      setUsableW(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    if (wrap.parentElement) ro.observe(wrap.parentElement);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.dataset.fingerings =
      showFingerings && hasStringFingering(instrument) ? "on" : "off";
  }, [showFingerings, instrument]);

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
        heightRef.current,
        Math.floor(
          wrapRef.current?.clientHeight ||
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
              clef: clefForNotes(instrument, line.midis),
              midis: line.midis,
              instrument,
              ...drawOpts,
            }),
        });
      });

      appendPieceStaffCard(pieceWrap, parts, { pad, systemGapClass, preview });
      host.appendChild(pieceWrap);
      host.dataset.fingerings =
        showFingerings && hasStringFingering(instrument) ? "on" : "off";
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
    pad,
    bothDirections,
    keepPhrasesWhole,
    scaleKind,
    staveWidth,
    tonicPitchClass,
    usableW,
    themeKey,
    appearance,
    preview,
    instrument,
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
