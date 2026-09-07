"use client";

import { useEffect, useRef } from "react";
import { animate, createTimeline } from "animejs";
import { AudioActivityVisualizer } from "@/components/AudioActivityVisualizer";
import { MUSAI_DUR, MUSAI_EASE, prefersReducedMotion } from "@/lib/motion";

type AnimeLike = { pause: () => void; revert?: () => void; cancel?: () => void };

/**
 * Calm analysing state — short wait copy only.
 */
export function ScaleAnalysisPanel({
  label = "Analysing…",
}: {
  label?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    if (prefersReducedMotion()) {
      root.style.opacity = "1";
      return;
    }

    root.style.opacity = "0";
    const glow = glowRef.current;
    const copy = copyRef.current;
    const handles: AnimeLike[] = [];

    const tl = createTimeline({
      defaults: { ease: MUSAI_EASE.out },
    });

    tl.add(root, {
      opacity: [0, 1],
      y: [8, 0],
      duration: MUSAI_DUR.enter,
    });

    if (copy) {
      tl.add(
        copy,
        {
          opacity: [0, 1],
          y: [4, 0],
          duration: MUSAI_DUR.base,
        },
        60,
      );
    }

    handles.push(tl as unknown as AnimeLike);

    if (glow) {
      const glowAnim = animate(glow, {
        opacity: [0.2, 0.4, 0.2],
        scale: [0.98, 1.02, 0.98],
        duration: 3600,
        ease: "inOutSine",
        loop: true,
        delay: 120,
      });
      handles.push(glowAnim as AnimeLike);
    }

    return () => {
      for (const h of handles) {
        try {
          h.pause();
          h.revert?.();
          h.cancel?.();
        } catch {
          /* cleanup */
        }
      }
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="musai-glass-surface relative flex flex-col items-center overflow-hidden px-6 py-14"
      role="status"
      aria-live="polite"
    >
      <div
        ref={glowRef}
        className="pointer-events-none absolute inset-0 -z-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 65% 50% at 50% 40%, color-mix(in srgb, var(--musai-accent) 12%, transparent) 0%, transparent 70%)",
          opacity: 0.35,
        }}
      />
      <div
        ref={copyRef}
        className="relative z-[1] flex w-full flex-col items-center"
      >
        <AudioActivityVisualizer variant="prominent" />
        <p className="mt-8 font-display text-base font-semibold tracking-tight text-[var(--musai-ink)]">
          {label}
        </p>
      </div>
    </div>
  );
}
