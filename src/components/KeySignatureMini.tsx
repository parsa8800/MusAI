"use client";

import { useEffect, useRef } from "react";
import type { ScaleKind, TonicAccidentalOption } from "@/lib/scales";
import { vexKeySignatureSpec } from "@/lib/vexflowScaleSpelling";

const NOTATION_FILL = "#1c1917";
const NOTATION_STROKE = "#a8a29e";

/**
 * Real VexFlow treble clef + key signature — same engraving as the staff notes.
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
  size?: "sm" | "md" | "lg";
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const width = size === "lg" ? 148 : size === "md" ? 118 : 72;
  const height = size === "lg" ? 64 : size === "md" ? 52 : 36;
  const lineSpacing = size === "lg" ? 7.4 : size === "md" ? 6.2 : 4.2;
  const staveY = size === "lg" ? 4 : size === "md" ? 2 : 1;

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

      host.innerHTML = "";
      const keySig = vexKeySignatureSpec(option.pitchClass, scaleKind);
      const { Renderer, Stave } = VF;
      const renderer = new Renderer(host, Renderer.Backends.SVG);
      renderer.resize(width, height);
      const ctx = renderer.getContext();
      ctx.setFillStyle(NOTATION_FILL);
      ctx.setStrokeStyle(NOTATION_STROKE);
      ctx.setBackgroundFillStyle("transparent");

      const stave = new Stave(2, staveY, width - 6, {
        spacingBetweenLinesPx: lineSpacing,
        spaceAboveStaffLn: 0.45,
        spaceBelowStaffLn: 0.45,
      });
      stave.setStyle({ fillStyle: NOTATION_FILL, strokeStyle: NOTATION_STROKE });
      stave.addClef("treble");
      stave.addKeySignature(keySig);
      stave.setContext(ctx).draw();

      const svg = host.querySelector("svg");
      if (svg) {
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        svg.style.display = "block";
        svg.style.overflow = "visible";
        try {
          const box = svg.getBBox();
          if (box.width > 0 && box.height > 0) {
            const pad = 3;
            svg.setAttribute(
              "viewBox",
              `${box.x - pad} ${box.y - pad} ${box.width + pad * 2} ${box.height + pad * 2}`,
            );
            svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
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
  }, [height, lineSpacing, option.pitchClass, scaleKind, staveY, width]);

  const boxClass =
    size === "lg"
      ? "h-[3.35rem] w-[7.75rem]"
      : size === "md"
        ? "h-[2.65rem] w-[6.1rem]"
        : "h-[1.7rem] w-[3.6rem]";

  return (
    <div
      ref={hostRef}
      className={`musai-key-btn__sig-host block shrink-0 overflow-hidden ${boxClass} ${className}`.trim()}
      aria-hidden
    />
  );
}
