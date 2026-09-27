"use client";

import { useEffect, useRef } from "react";
import { createDefaultScoreRenderer } from "@/features/piece-studio/score/createDefaultScoreRenderer";
import {
  pieceOsmdInk,
  readPieceOsmdTheme,
} from "@/features/piece-studio/score/osmdTheme";
import {
  cropSvgToFirstSystem,
  stripLibrarySnippetWords,
} from "@/features/piece-studio/pieceLibrarySnippet";

/**
 * A short engraved opening of the piece — the same notation as the score,
 * cropped to the first system. No pitch colours.
 */
export function PieceLibraryIncipit({ musicXml }: { musicXml: string | null }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !musicXml) return;
    const renderer = createDefaultScoreRenderer();
    let cancelled = false;

    void (async () => {
      try {
        await renderer.mount(host);
        if (cancelled) return;
        await renderer.load({ format: "musicxml", content: musicXml });
        if (cancelled) return;
        const cardWidth = host.parentElement?.getBoundingClientRect().width ?? 0;
        renderer.paint(readPieceOsmdTheme(), {
          viewMode: "continuous",
          purpose: "library-snippet",
          viewportWidthPx: Math.max(360, Math.round(cardWidth) || 420),
          viewportHeightPx: 160,
        });
        if (cancelled) return;
        const svg = host.querySelector("svg");
        if (svg) {
          stripLibrarySnippetWords(svg);
          cropSvgToFirstSystem(svg);
          paintRawInk(svg, pieceOsmdInk(readPieceOsmdTheme()));
        }
        host.querySelectorAll(".osmd-cursor, [id^='osmdCursor']").forEach((node) => {
          node.remove();
        });
        host.style.width = "100%";
        host.style.height = "100%";
        host.style.maxWidth = "100%";
        host.style.marginInline = "0";
        for (const page of host.querySelectorAll<HTMLElement>('[id^="osmdCanvasPage"]')) {
          page.style.width = "100%";
          page.style.height = "100%";
          page.style.maxWidth = "100%";
          page.style.overflow = "hidden";
        }
        if (svg) {
          svg.style.width = "100%";
          svg.style.height = "100%";
          svg.style.display = "block";
        }
      } catch {
        host.replaceChildren();
      }
    })();

    return () => {
      cancelled = true;
      renderer.dispose();
      host.replaceChildren();
    };
  }, [musicXml]);

  if (!musicXml) return null;

  return (
    <span className="musai-piece-library__incipit">
      <div ref={hostRef} className="musai-piece-library__incipit-host" />
    </span>
  );
}

function paintRawInk(svg: SVGSVGElement, ink: string): void {
  for (const el of svg.querySelectorAll("*")) {
    if (el.tagName.toLowerCase() === "rect") {
      const w = Number(el.getAttribute("width"));
      const h = Number(el.getAttribute("height"));
      if (w > 160 && h > 48) continue;
    }
    for (const attr of ["fill", "stroke"] as const) {
      const value = el.getAttribute(attr);
      if (!value || value === "none" || value === "transparent") continue;
      el.setAttribute(attr, ink);
    }
  }
}
