"use client";

import { useEffect, useRef, useState } from "react";
import { useInstrument } from "@/components/InstrumentProvider";
import { vexflowClef } from "@/lib/instrument";
import type { ScaleKind, TonicAccidentalOption } from "@/lib/scales";
import {
  keySignatureMiniAccidentalPoint,
  keySignatureMiniClefPoint,
  vexKeySignatureSpec,
} from "@/lib/vexflowScaleSpelling";

function notationColors() {
  if (typeof window === "undefined") {
    return { fill: "#1c1917", stroke: "#b7aea3" };
  }
  const s = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    s.getPropertyValue(name).trim() || fallback;
  return {
    fill: read("--musai-notation", read("--musai-ink", "#1c1917")),
    stroke: read("--musai-staff-line", "#b7aea3"),
  };
}

/** Clef, accidentals, and staff ink in the SVG's user units. */
function signatureInkBox(
  svg: SVGSVGElement,
  canvasWidth: number,
  canvasHeight: number,
): { top: number; bottom: number; right: number } | null {
  const svgRect = svg.getBoundingClientRect();
  if (svgRect.width < 2 || svgRect.height < 2) return null;
  let top = Infinity;
  let bottom = 0;
  let right = 0;
  for (const el of svg.querySelectorAll(".vf-clef, .vf-keysignature")) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 0.5 && rect.height < 0.5) continue;
    const y = ((rect.top - svgRect.top) * canvasHeight) / svgRect.height;
    const y1 = ((rect.bottom - svgRect.top) * canvasHeight) / svgRect.height;
    const x1 = ((rect.right - svgRect.left) * canvasWidth) / svgRect.width;
    top = Math.min(top, y);
    bottom = Math.max(bottom, y1);
    right = Math.max(right, x1);
  }
  if (!Number.isFinite(top) || bottom <= top || right < 4) return null;
  return { top, bottom, right };
}

/** Vertical crop room (staff spaces). Enough for a full-height clef. */
const CLEF_VIEW_PAD = {
  treble: { above: 1.85, below: 2.1 },
  alto: { above: 1.55, below: 1.55 },
  bass: { above: 1.45, below: 2.05 },
} as const;

const SIZE = {
  sm: {
    width: 168,
    height: 50,
    lineSpacing: 5.35,
    staveY: 11,
    box: "h-[2.55rem] w-[8.85rem]",
    viewW: 148,
  },
  md: {
    width: 118,
    height: 56,
    lineSpacing: 6.1,
    staveY: 9,
    box: "h-[2.9rem] w-[6.1rem]",
    viewW: null,
  },
  row: {
    width: 184,
    height: 54,
    lineSpacing: 5.45,
    staveY: 11,
    box: "h-[3.05rem] w-[9.55rem]",
    viewW: 156,
  },
  lg: {
    width: 148,
    height: 68,
    lineSpacing: 7.1,
    staveY: 10,
    box: "h-[3.5rem] w-[7.75rem]",
    viewW: null,
  },
  chip: {
    width: 260,
    height: 86,
    lineSpacing: 8.4,
    staveY: 14,
    box: "musai-key-sig-preview--chip h-[3.55rem] w-max",
    viewW: null,
  },
} as const;

/**
 * Real VexFlow clef + key signature — same engraving as the staff notes.
 * Uses the active instrument clef (treble / alto) from InstrumentProvider.
 * Browser sizes (sm/row) share a fixed viewBox so 1 sharp and 6 sharps
 * stay at the same scale instead of each signature filling the box.
 */
export function KeySignatureMini({
  option,
  scaleKind,
  className = "",
  size = "sm",
}: {
  option: TonicAccidentalOption;
  scaleKind: ScaleKind;
  className?: string;
  size?: "sm" | "md" | "row" | "lg" | "chip";
}) {
  const { instrument } = useInstrument();
  const clef = vexflowClef(instrument);
  const hostRef = useRef<HTMLDivElement>(null);
  const [themeKey, setThemeKey] = useState("light");
  const { width, height, lineSpacing, staveY, box, viewW } = SIZE[size];
  const pad = CLEF_VIEW_PAD[clef];

  useEffect(() => {
    const sync = () => {
      setThemeKey(
        document.documentElement.dataset.theme === "dark" ? "dark" : "light",
      );
    };
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;

    void (async () => {
      try {
        await (document as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready;
      } catch {
        /* ignore */
      }
      if (cancelled || !host) return;

      let VF: typeof import("vexflow");
      try {
        VF = await import("vexflow");
      } catch {
        return;
      }
      if (cancelled || !host) return;

      try {
        await (
          document as { fonts?: { load?: (s: string) => Promise<unknown> } }
        ).fonts?.load?.("16px Bravura");
      } catch {
        /* ignore */
      }
      if (cancelled || !host) return;

      const { fill, stroke } = notationColors();
      const keySig = vexKeySignatureSpec(option.pitchClass, scaleKind);
      const clefPoint =
        size === "chip"
          ? Math.round(Math.max(26, Math.min(34, lineSpacing * 3.7)))
          : keySignatureMiniClefPoint(lineSpacing);
      const accidentalPoint =
        size === "chip"
          ? Math.round(Math.max(22, Math.min(30, lineSpacing * 3.35)))
          : keySignatureMiniAccidentalPoint(lineSpacing);

      const metricsDefaults = VF.MetricsDefaults as {
        KeySignature?: { fontSize?: number };
      };
      const hadKeySig = Object.prototype.hasOwnProperty.call(
        metricsDefaults,
        "KeySignature",
      );
      const prevKeySig = metricsDefaults.KeySignature
        ? { ...metricsDefaults.KeySignature }
        : undefined;

      // Shrink key-signature glyphs before they are created (default is 30pt).
      metricsDefaults.KeySignature = { fontSize: accidentalPoint };
      try {
        VF.Metrics.clear("KeySignature");
      } catch {
        /* ignore — clear is best-effort */
      }

      try {
        host.innerHTML = "";
        const { Renderer, Stave } = VF;
        const renderer = new Renderer(host, Renderer.Backends.SVG);
        renderer.resize(width, height);
        const ctx = renderer.getContext();
        ctx.setFillStyle(fill);
        ctx.setStrokeStyle(stroke);
        ctx.setBackgroundFillStyle("transparent");
        ctx.setLineWidth(1.35);

        const stave = new Stave(1, staveY, width - 2, {
          spacingBetweenLinesPx: lineSpacing,
          spaceAboveStaffLn: pad.above,
          spaceBelowStaffLn: pad.below,
        });
        stave.setStyle({ fillStyle: fill, strokeStyle: stroke });
        stave.addClef(clef, "default");

        const beginPos =
          VF.StaveModifierPosition?.BEGIN ??
          (VF as { StaveModifierPosition?: { BEGIN?: number } }).StaveModifierPosition
            ?.BEGIN ??
          5;
        const clefCategory = VF.Clef?.CATEGORY ?? "Clef";
        for (const mod of stave.getModifiers(beginPos, clefCategory)) {
          const sized = mod as {
            setFontSize?: (size: number | string) => unknown;
          };
          sized.setFontSize?.(clefPoint);
        }

        stave.addKeySignature(keySig);
        stave.setContext(ctx).draw();

        for (const el of host.querySelectorAll(".vf-clef text, .vf-clef")) {
          if (el instanceof SVGElement) {
            el.setAttribute("font-size", `${clefPoint}pt`);
          }
        }
        for (const el of host.querySelectorAll(
          ".vf-keysignature text, g.vf-keysignature text",
        )) {
          if (el instanceof SVGElement) {
            el.setAttribute("font-size", `${accidentalPoint}pt`);
          }
        }

        const svg = host.querySelector("svg");
        if (svg) {
          svg.setAttribute("width", "100%");
          svg.setAttribute("height", "100%");
          svg.style.width = "100%";
          svg.style.height = "100%";
          svg.style.display = "block";
          svg.style.overflow = "visible";
          svg.querySelectorAll("[fill], [stroke]").forEach((el) => {
            const f = el.getAttribute("fill");
            const st = el.getAttribute("stroke");
            if (f === "#000" || f === "#000000" || f === "black") {
              el.setAttribute("fill", fill);
            }
            if (st === "#000" || st === "#000000" || st === "black") {
              el.setAttribute("stroke", fill);
            }
          });
          try {
            if (size === "chip") {
              const ink = signatureInkBox(svg, width, height);
              const staffTop = stave.getYForLine(0);
              const staffBottom = stave.getYForLine(4);
              const staffMid = (staffTop + staffBottom) / 2;
              const half = lineSpacing * (2 + Math.max(pad.above, pad.below, 2.2));
              const top = staffMid - half;
              const boxH = half * 2;
              const inkRight = ink?.right ?? width * 0.42;
              const viewRight = Math.min(
                width - 1,
                Math.max(inkRight + lineSpacing * 2.2, lineSpacing * 8.5),
              );
              svg.setAttribute("viewBox", `0.5 ${top} ${viewRight} ${boxH}`);
              svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
              const cssH = 57;
              svg.setAttribute(
                "width",
                String(Math.round((cssH * viewRight) / boxH)),
              );
              svg.setAttribute("height", String(cssH));
              svg.style.width = "auto";
              svg.style.height = "100%";
            } else if (viewW != null) {
              const top = stave.getYForLine(0) - lineSpacing * pad.above;
              const bottom = stave.getYForLine(4) + lineSpacing * pad.below;
              svg.setAttribute(
                "viewBox",
                `0.5 ${top} ${viewW} ${Math.max(bottom - top, lineSpacing * 8)}`,
              );
              svg.setAttribute("preserveAspectRatio", "xMinYMid meet");
            } else {
              const drawn = svg.getBBox();
              if (drawn.width > 0 && drawn.height > 0) {
                const padX = 3;
                const y = stave.getYForLine(0) - lineSpacing * pad.above;
                const h = lineSpacing * (4 + pad.above + pad.below);
                const x = Math.min(drawn.x, 1) - padX;
                const w = Math.max(drawn.width + padX * 2, width * 0.7);
                svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
                svg.setAttribute("preserveAspectRatio", "xMinYMid meet");
              }
            }
          } catch {
            /* ignore viewBox failures */
          }
        }
      } catch {
        /* leave host empty rather than crash the menu */
      } finally {
        if (!hadKeySig) {
          delete metricsDefaults.KeySignature;
        } else if (prevKeySig) {
          metricsDefaults.KeySignature = prevKeySig;
        }
        try {
          VF.Metrics.clear("KeySignature");
        } catch {
          /* ignore */
        }
      }
    })();

    return () => {
      cancelled = true;
      host.innerHTML = "";
    };
  }, [
    clef,
    height,
    lineSpacing,
    option.pitchClass,
    pad.above,
    pad.below,
    scaleKind,
    size,
    staveY,
    themeKey,
    viewW,
    width,
  ]);

  return (
    <div
      ref={hostRef}
      className={`musai-key-btn__sig-host musai-key-sig-preview block shrink-0 ${box} ${className}`.trim()}
      aria-hidden
    />
  );
}
