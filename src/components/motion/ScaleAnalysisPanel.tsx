"use client";

import { useEffect, useRef } from "react";
import { animate, createTimeline } from "animejs";
import { AudioActivityVisualizer } from "@/components/AudioActivityVisualizer";
import { MUSAI_DUR, MUSAI_EASE, prefersReducedMotion } from "@/lib/motion";

type AnimeLike = { pause: () => void; revert?: () => void; cancel?: () => void };

/**
 * Polished analysing state for Scale Studio — waveform + glow timeline,
 * no fake % progress.
 */
export function ScaleAnalysisPanel({
  label = "Analysing your scale…",
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
      y: [10, 0],
      duration: MUSAI_DUR.enter,
    });

    if (copy) {
      tl.add(
        copy,
        {
          opacity: [0, 1],
          y: [6, 0],
          duration: MUSAI_DUR.base,
        },
        80,
      );
    }

    handles.push(tl as unknown as AnimeLike);

    if (glow) {
      const glowAnim = animate(glow, {
        opacity: [0.28, 0.55, 0.28],
        scale: [0.97, 1.03, 0.97],
        duration: 3200,
        ease: "inOutSine",
        loop: true,
        delay: 160,
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
      className="musai-glass-surface relative flex flex-col items-center overflow-hidden px-6 py-12"
      role="status"
      aria-live="polite"
    >
      <div
        ref={glowRef}
        className="pointer-events-none absolute inset-0 -z-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 42%, rgba(56,189,248,0.16) 0%, rgba(14,165,233,0.06) 42%, transparent 72%)",
          opacity: 0.45,
        }}
      />
      <div
        ref={copyRef}
        className="relative z-[1] flex w-full flex-col items-center"
      >
        <AudioActivityVisualizer variant="prominent" />
        <p className="mt-8 text-sm font-medium tracking-tight text-zinc-200">
          {label}
        </p>
        <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
          Pitch · timing · intonation
        </p>
      </div>
    </div>
  );
}
