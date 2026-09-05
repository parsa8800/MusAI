"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listScalePracticeHistory,
  persistScalePracticeSession,
  removeScalePracticeHistoryEntry,
} from "@/lib/scalePracticeSession";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";

/** Fixed format — avoids locale hydration mismatches. */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const day = d.getDate();
  const mon = months[d.getMonth()] ?? "";
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const hour12 = ((h + 11) % 12) + 1;
  const ampm = h >= 12 ? "pm" : "am";
  return `${day} ${mon}, ${hour12}:${m}${ampm}`;
}

function scoreTone(score: number): {
  row: string;
  score: string;
  dot: string;
} {
  if (score >= 85) {
    return {
      row: "border-emerald-400/35 bg-emerald-500/[0.12] hover:bg-emerald-500/[0.18]",
      score: "text-emerald-300",
      dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.55)]",
    };
  }
  if (score >= 60) {
    return {
      row: "border-amber-400/35 bg-amber-500/[0.12] hover:bg-amber-500/[0.18]",
      score: "text-amber-300",
      dot: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.45)]",
    };
  }
  return {
    row: "border-rose-400/35 bg-rose-500/[0.12] hover:bg-rose-500/[0.18]",
    score: "text-rose-300",
    dot: "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.45)]",
  };
}

/**
 * Recent scale takes from localStorage (Phase 0.5).
 * Renders only after mount so SSR/client HTML stay in sync.
 */
export function ScaleRecentTakesPanel() {
  const router = useRouter();
  const [takes, setTakes] = useState<ScalePracticeSessionV1[] | null>(null);

  useEffect(() => {
    setTakes(listScalePracticeHistory());
  }, []);

  if (!takes || takes.length === 0) return null;

  return (
    <section
      className="musai-glass-inset w-full border border-sky-400/20 bg-sky-400/[0.04] px-3.5 py-3.5 sm:px-4"
      aria-label="Recent takes"
    >
      <div className="text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-300/90">
          Recent
        </p>
      </div>
      <ul className="mt-3 max-h-[min(50vh,22rem)] space-y-2 overflow-y-auto">
        {takes.map((s) => {
          const score = s.summary.overallScore0to100;
          const tone = scoreTone(score);
          return (
            <li key={s.sessionId} className="group relative">
              <button
                type="button"
                className={`flex w-full flex-col items-center gap-0.5 rounded-xl border px-3 py-2.5 pr-7 text-center transition-colors duration-200 ${tone.row}`}
                onClick={() => {
                  persistScalePracticeSession(s);
                  router.push(
                    `/practice/scale/results?id=${encodeURIComponent(s.sessionId)}`,
                  );
                }}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`}
                    aria-hidden
                  />
                  <span className="truncate text-[13px] font-semibold text-zinc-50">
                    {s.scaleLabel}
                  </span>
                </span>
                <span
                  className={`text-[15px] font-semibold tabular-nums tracking-tight ${tone.score}`}
                >
                  {score}
                </span>
                <span className="text-[10px] text-zinc-500">
                  {formatWhen(s.recordedAt)}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Delete ${s.scaleLabel} take`}
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-zinc-300 opacity-100 transition-[opacity,background-color,color] duration-150 hover:bg-rose-500/80 hover:text-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-300/60 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  removeScalePracticeHistoryEntry(s.sessionId);
                  setTakes(listScalePracticeHistory());
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    d="M6 6l12 12M18 6L6 18"
                  />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
