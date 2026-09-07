"use client";

import { useMemo } from "react";

type Props = {
  /** Smoothed 0–1 levels from the live mic analyser. */
  levels: number[];
  /** Visual height budget in px. */
  height?: number;
  className?: string;
  /** Dimmer bars for mini/dock layouts. */
  tone?: "studio" | "mini";
};

/**
 * Live mic waveform for Scale Studio — driven by real analyser levels,
 * transform/opacity only, reserved height to avoid layout jitter.
 */
export function LiveRecordingWaveform({
  levels,
  height = 36,
  className = "",
  tone = "studio",
}: Props) {
  const bars = useMemo(() => {
    // Mirror a shorter half for a symmetric “performance” silhouette.
    const half = levels.length > 16 ? levels.filter((_, i) => i % 2 === 0) : levels;
    const mid = Math.floor(half.length / 2);
    const left = half.slice(0, mid).reverse();
    const right = half.slice(mid);
    return [...left, ...right];
  }, [levels]);

  const barClass =
    tone === "mini"
      ? "bg-[color-mix(in_srgb,var(--musai-accent-2)_55%,transparent)]"
      : "bg-gradient-to-t from-[color-mix(in_srgb,var(--musai-accent-2)_35%,transparent)] via-[color-mix(in_srgb,var(--musai-accent-2)_70%,transparent)] to-[color-mix(in_srgb,var(--musai-accent-2)_90%,white)]";

  return (
    <div
      className={`flex w-full max-w-[240px] items-end justify-center gap-[2px] px-1 ${className}`}
      style={{ height }}
      role="img"
      aria-label="Live microphone waveform"
    >
      {bars.map((lv, i) => {
        const h = Math.max(3, Math.round(lv * (height - 4)));
        return (
          <span
            key={i}
            className={`musai-capture-meter-bar w-[2.5px] max-w-[2.5px] shrink-0 rounded-full ${barClass}`}
            style={{
              height: `${h}px`,
              opacity: 0.35 + lv * 0.65,
            }}
          />
        );
      })}
    </div>
  );
}
