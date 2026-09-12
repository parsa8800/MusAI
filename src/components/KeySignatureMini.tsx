"use client";

import { useEffect, useRef, useState } from "react";
import type { ScaleKind, TonicAccidentalOption } from "@/lib/scales";
import { vexKeySignatureSpec } from "@/lib/vexflowScaleSpelling";

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

const SIZE = {
  sm: {
    width: 138,
    height: 38,
    lineSpacing: 5.15,
    staveY: 3,
    box: "h-[2.15rem] w-[7.35rem]",
    viewW: 118,
  },
  md: {
    width: 118,
    height: 52,
    lineSpacing: 6.2,
    staveY: 2,
    box: "h-[2.65rem] w-[6.1rem]",
    viewW: null,
  },
  row: {
    width: 156,
    height: 40,
    lineSpacing: 5.25,
    staveY: 3,
    box: "h-[2.35rem] w-[8.35rem]",
    viewW: 128,
  },
  lg: {
    width: 148,
    height: 64,
    lineSpacing: 7.4,
    staveY: 4,
    box: "h-[3.35rem] w-[7.75rem]",
    viewW: null,
  },
} as const;

/**
 * Real VexFlow treble clef + key signature — same engraving as the staff notes.
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
  size?: "sm" | "md" | "row" | "lg";
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [themeKey, setThemeKey] = useState("light");
  const { width, height, lineSpacing, staveY, box, viewW } = SIZE[size];

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
      const VF = await import("vexflow");
      if (cancelled || !host) return;

      try {
        await (
          document as { fonts?: { load?: (s: string) => Promise<unknown> } }
        ).fonts?.load?.("16px Bravura");
      } catch {
        /* ignore */
      }

      const { fill, stroke } = notationColors();
      host.innerHTML = "";
      const keySig = vexKeySignatureSpec(option.pitchClass, scaleKind);
      const { Renderer, Stave } = VF;
      const renderer = new Renderer(host, Renderer.Backends.SVG);
      renderer.resize(width, height);
      const ctx = renderer.getContext();
      ctx.setFillStyle(fill);
      ctx.setStrokeStyle(stroke);
      ctx.setBackgroundFillStyle("transparent");

      const stave = new Stave(1, staveY, width - 2, {
        spacingBetweenLinesPx: lineSpacing,
        spaceAboveStaffLn: 1.35,
        spaceBelowStaffLn: 1.05,
      });
      stave.setStyle({ fillStyle: fill, strokeStyle: stroke });
      stave.addClef("treble");
      stave.addKeySignature(keySig);
      stave.setContext(ctx).draw();

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
          if (viewW != null) {
            const top = stave.getYForLine(0) - lineSpacing * 1.7;
            const bottom = stave.getYForLine(4) + lineSpacing * 1.55;
            svg.setAttribute(
              "viewBox",
              `0.5 ${top} ${viewW} ${bottom - top}`,
            );
            svg.setAttribute("preserveAspectRatio", "xMinYMid meet");
          } else {
            const box = svg.getBBox();
            if (box.width > 0 && box.height > 0) {
              const padX = 3;
              const y = staveY - lineSpacing * 1.55;
              const h = lineSpacing * 7.35;
              const x = Math.min(box.x, 1) - padX;
              const w = Math.max(box.width + padX * 2, width * 0.7);
              svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
              svg.setAttribute("preserveAspectRatio", "xMinYMid meet");
            }
          }
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
    height,
    lineSpacing,
    option.pitchClass,
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
