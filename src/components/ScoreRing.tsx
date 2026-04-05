"use client";

import { scoreAccentColor } from "@/lib/intonation";

type ScoreRingProps = {
  score: number;
  /** Pixels — SVG viewBox is 120×120; scales visually */
  size?: number;
  label?: string;
};

/**
 * Circular progress: 100% = full ring, lower scores show an open arc (WHOOP-style).
 */
export function ScoreRing({
  score,
  size = 200,
  label = "Intonation",
}: ScoreRingProps) {
  const r = 50;
  const stroke = 7;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = c * (1 - clamped / 100);
  const accent = scoreAccentColor(clamped);

  return (
    <div
      className="relative inline-flex shrink-0"
      style={{ width: size, height: size }}
      aria-label={`Intonation score ${Math.round(clamped)} percent`}
      role="img"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        className="-rotate-90"
      >
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none"
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[2.75rem] font-semibold leading-none tracking-tight text-white tabular-nums">
          {Math.round(clamped)}
        </span>
        <span className="mt-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-zinc-500">
          {label}
        </span>
      </div>
    </div>
  );
}
