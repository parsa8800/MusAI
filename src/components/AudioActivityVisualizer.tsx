"use client";

import { useId } from "react";

const BAR_COUNT = 42;

type AudioActivityVisualizerProps = {
  /** Taller bars + wider row for the full-page analyzing card */
  variant?: "compact" | "prominent";
  className?: string;
};

/**
 * Minimal continuous motion: thin EQ-style bars + scrolling waveform stroke.
 * Shared by upload processing and analyze loading (no spinner).
 */
export function AudioActivityVisualizer({
  variant = "compact",
  className = "",
}: AudioActivityVisualizerProps) {
  const gid = useId().replace(/:/g, "");
  const gradId = `musai-audio-viz-grad-${gid}`;

  const barH = variant === "prominent" ? 44 : 36;
  const rowMaxW = variant === "prominent" ? "min(280px,100%)" : "min(240px,100%)";

  return (
    <div
      className={`flex w-full flex-col items-center ${className}`}
      aria-hidden
    >
      <div
        className="relative mb-4 w-full overflow-hidden"
        style={{ maxWidth: rowMaxW, height: variant === "prominent" ? 22 : 18 }}
      >
        <svg
          className="musai-audio-viz-wave-svg block h-full w-[200%] max-w-none"
          viewBox="0 0 400 24"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(47,111,94,0)" />
              <stop offset="35%" stopColor="rgba(47,111,94,0.2)" />
              <stop offset="50%" stopColor="rgba(47,111,94,0.42)" />
              <stop offset="65%" stopColor="rgba(47,111,94,0.2)" />
              <stop offset="100%" stopColor="rgba(47,111,94,0)" />
            </linearGradient>
          </defs>
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path
              stroke={`url(#${gradId})`}
              strokeWidth="1.1"
              vectorEffect="non-scaling-stroke"
              d="M0,12 C32,5 64,19 96,12 S160,5 192,12 S256,19 288,12 S320,6 352,12 S376,18 400,12"
            />
            <path
              stroke={`url(#${gradId})`}
              strokeWidth="1.1"
              vectorEffect="non-scaling-stroke"
              transform="translate(400,0)"
              d="M0,12 C32,5 64,19 96,12 S160,5 192,12 S256,19 288,12 S320,6 352,12 S376,18 400,12"
            />
          </g>
        </svg>
      </div>

      <div
        className="flex items-end justify-center gap-[2px] px-0.5 motion-reduce:gap-1"
        style={{
          width: rowMaxW,
          height: barH,
        }}
      >
        {Array.from({ length: BAR_COUNT }, (_, i) => {
          const dur = 0.62 + ((i * 17) % 9) * 0.055;
          const delay = ((i * 97) % 380) / 1000;
          return (
            <span
              key={i}
              className="musai-audio-viz-bar w-px shrink-0 rounded-full bg-gradient-to-t from-[color-mix(in_srgb,var(--musai-accent)_10%,transparent)] via-[color-mix(in_srgb,var(--musai-accent)_45%,transparent)] to-[color-mix(in_srgb,var(--musai-accent)_55%,white)] sm:w-[1.5px]"
              style={{
                height: `${barH}px`,
                animationDuration: `${dur}s`,
                animationDelay: `${delay}s`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
