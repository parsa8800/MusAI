"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
type ScoreRingProps = {
  score: number;
  size?: number;
  label?: string;
  resultsMode?: boolean;
  resultsLoading?: boolean;
  resultsRevealMs?: number;
};

const R = 50;
const STROKE = 7;
const C = 2 * Math.PI * R;
const CX = 60;
const CY = 60;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3.25);
}

function subscribeReducedMotion(cb: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function getReducedMotionSnapshot() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getReducedMotionServerSnapshot() {
  return false;
}

/** Ring stroke color from score (0–100), using design tokens. */
function scoreRingColor(score: number): string {
  if (score >= 85) return "var(--musai-ok)";
  if (score >= 60) return "var(--musai-warn)";
  return "var(--musai-accent-2)";
}

/**
 * Circular progress: 100% = full ring, lower scores show an open arc (WHOOP-style).
 */
export function ScoreRing({
  score,
  size = 200,
  label = "Intonation",
  resultsMode = false,
  resultsLoading = false,
  resultsRevealMs = 2200,
}: ScoreRingProps) {
  const uid = useId().replace(/:/g, "");
  const loadGradId = `sgl-${uid}`;

  const target = Math.max(0, Math.min(100, score));
  const reduceMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );

  const [revealPct, setRevealPct] = useState(0);
  const revealRafRef = useRef<number | null>(null);

  const displayPct = resultsMode ? revealPct : target;

  useEffect(() => {
    if (!resultsMode) return;

    if (resultsLoading) {
      if (revealRafRef.current != null) {
        cancelAnimationFrame(revealRafRef.current);
        revealRafRef.current = null;
      }
      const id = requestAnimationFrame(() => setRevealPct(0));
      return () => cancelAnimationFrame(id);
    }

    if (reduceMotion) {
      const id = requestAnimationFrame(() => setRevealPct(target));
      return () => cancelAnimationFrame(id);
    }

    if (revealRafRef.current != null) {
      cancelAnimationFrame(revealRafRef.current);
      revealRafRef.current = null;
    }

    const duration = Math.max(400, resultsRevealMs);
    let start: number | null = null;

    const tick = (now: number) => {
      if (start === null) start = now;
      const raw = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(raw);
      setRevealPct(target * eased);
      if (raw < 1) {
        revealRafRef.current = requestAnimationFrame(tick);
      } else {
        setRevealPct(target);
        revealRafRef.current = null;
      }
    };

    const kick = requestAnimationFrame(() => {
      setRevealPct(0);
      revealRafRef.current = requestAnimationFrame(tick);
    });

    return () => {
      cancelAnimationFrame(kick);
      if (revealRafRef.current != null) {
        cancelAnimationFrame(revealRafRef.current);
        revealRafRef.current = null;
      }
    };
  }, [resultsMode, resultsLoading, target, resultsRevealMs, reduceMotion]);

  const accent = scoreRingColor(target);
  const offset = C * (1 - displayPct / 100);
  const rounded = Math.round(displayPct);

  const showLoading = resultsMode && resultsLoading && !reduceMotion;

  const progressClass = !resultsMode
    ? "transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none"
    : "";

  return (
    <div
      className="relative inline-flex shrink-0"
      style={{ width: size, height: size }}
      aria-label={
        showLoading
          ? "Computing intonation score"
          : `Intonation score ${Math.round(target)} percent`
      }
      aria-busy={showLoading}
      role="img"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        className="-rotate-90"
      >
        <defs>
          <linearGradient id={loadGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--musai-border)" />
            <stop offset="45%" stopColor="var(--musai-accent)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--musai-muted)" stopOpacity="0.35" />
          </linearGradient>
        </defs>

        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke="var(--musai-border)"
          strokeWidth={STROKE}
        />

        {showLoading ? (
          <>
            <circle
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke="var(--musai-surface-2)"
              strokeWidth={STROKE + 2}
              className="musai-score-ring-pulse-track"
            />
            <g className="musai-score-ring-loading-spin">
              <circle
                cx={CX}
                cy={CY}
                r={R}
                fill="none"
                stroke={`url(#${loadGradId})`}
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={`${C * 0.11} ${C * 0.89}`}
                strokeDashoffset={0}
                opacity={0.85}
              />
            </g>
          </>
        ) : (
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke={accent}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
            className={progressClass}
          />
        )}
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {showLoading ? (
          <>
            <span
              className="text-[2.75rem] font-semibold leading-none tracking-tight text-[var(--musai-muted)] tabular-nums opacity-40 motion-safe:musai-score-ellipsis"
              aria-hidden
            >
              ···
            </span>
            <span className="mt-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[var(--musai-muted)]">
              Analyzing
            </span>
          </>
        ) : (
          <>
            <span className="font-display text-[2.75rem] font-semibold leading-none tracking-tight text-[var(--musai-ink)] tabular-nums">
              {rounded}
            </span>
            <span className="mt-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[var(--musai-muted)]">
              {label}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
