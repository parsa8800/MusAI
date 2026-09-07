"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

type Props = {
  /** 0–1 fill amount for the soft ring. */
  fill: number;
  label: string;
  loading?: boolean;
  size?: number;
};

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

/**
 * Soft stage ring — forest accent only (never punishing red for beginners).
 */
export function PracticeStageRing({
  fill,
  label,
  loading = false,
  size = 112,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const gradId = `psg-${uid}`;
  const R = 44;
  const STROKE = 6.5;
  const C = 2 * Math.PI * R;
  const target = Math.max(0.08, Math.min(1, fill));

  const reduceMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    () => false,
  );

  const [reveal, setReveal] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (loading) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      const id = requestAnimationFrame(() => setReveal(0));
      return () => cancelAnimationFrame(id);
    }
    if (reduceMotion) {
      const id = requestAnimationFrame(() => setReveal(target));
      return () => cancelAnimationFrame(id);
    }
    const start = performance.now();
    const dur = 1400;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      setReveal(target * easeOutCubic(t));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [loading, reduceMotion, target]);

  const dash = C * (1 - reveal);

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Practice stage: ${label}`}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--musai-accent)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--musai-ok)" />
          </linearGradient>
        </defs>
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke="var(--musai-border)"
          strokeWidth={STROKE}
          opacity="0.85"
        />
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={dash}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center px-3 text-center">
        <p className="font-display text-[0.7rem] font-semibold leading-tight tracking-tight text-[var(--musai-ink)] sm:text-[0.75rem]">
          {label}
        </p>
      </div>
    </div>
  );
}
