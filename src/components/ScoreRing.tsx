"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { scoreAccentColor } from "@/lib/intonation";

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
  const glowFilterId = `sgf-${uid}`;
  const loadGradId = `sgl-${uid}`;
  const capGradId = `sgc-${uid}`;

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

  const accent = scoreAccentColor(target);
  const offset = C * (1 - displayPct / 100);
  const rounded = Math.round(displayPct);

  const showLoading = resultsMode && resultsLoading && !reduceMotion;
  const showReveal =
    resultsMode && !resultsLoading && !reduceMotion && displayPct < target - 0.2;

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
          <filter
            id={glowFilterId}
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id={capGradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.25" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.65" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id={loadGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
            <stop offset="45%" stopColor="rgba(250,204,21,0.5)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.18)" />
          </linearGradient>
        </defs>

        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={STROKE}
        />

        {showLoading ? (
          <>
            <circle
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke="rgba(255,255,255,0.05)"
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
                opacity={0.9}
              />
            </g>
          </>
        ) : (
          <>
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
              filter={showReveal ? `url(#${glowFilterId})` : undefined}
              opacity={0.94}
              className={progressClass}
            />
            {showReveal ? (
              <circle
                cx={CX}
                cy={CY}
                r={R}
                fill="none"
                stroke={`url(#${capGradId})`}
                strokeWidth={STROKE * 0.42}
                strokeLinecap="round"
                strokeDasharray={`${C * 0.035} ${C}`}
                strokeDashoffset={offset}
                className="musai-score-ring-cap-glow pointer-events-none"
                opacity={0.95}
              />
            ) : null}
          </>
        )}
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {showLoading ? (
          <>
            <span
              className="text-[2.75rem] font-semibold leading-none tracking-tight text-white/30 tabular-nums motion-safe:musai-score-ellipsis"
              aria-hidden
            >
              ···
            </span>
            <span className="mt-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-zinc-600">
              Analyzing
            </span>
          </>
        ) : (
          <>
            <span className="text-[2.75rem] font-semibold leading-none tracking-tight text-white tabular-nums">
              {rounded}
            </span>
            <span className="mt-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-zinc-500">
              {label}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
