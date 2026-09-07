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
      row: "border-[color-mix(in_srgb,var(--musai-ok)_28%,var(--musai-border))] bg-[var(--musai-accent-soft)] hover:brightness-[0.98]",
      score: "text-[var(--musai-ok)]",
      dot: "bg-[var(--musai-ok)]",
    };
  }
  if (score >= 60) {
    return {
      row: "border-[color-mix(in_srgb,var(--musai-warn)_28%,var(--musai-border))] bg-[color-mix(in_srgb,var(--musai-warn)_10%,white)] hover:brightness-[0.98]",
      score: "text-[var(--musai-warn)]",
      dot: "bg-[var(--musai-warn)]",
    };
  }
  return {
    row: "border-[color-mix(in_srgb,var(--musai-accent-2)_28%,var(--musai-border))] bg-[color-mix(in_srgb,var(--musai-accent-2)_10%,white)] hover:brightness-[0.98]",
    score: "text-[var(--musai-accent-2)]",
    dot: "bg-[var(--musai-accent-2)]",
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
      className="w-full border border-[var(--musai-border)] bg-[var(--musai-surface)] px-3.5 py-3.5 sm:px-4 rounded-[var(--musai-radius-lg)] shadow-[var(--musai-shadow)]"
      aria-label="Recent takes"
    >
      <div className="text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--musai-muted)]">
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
                className={`flex w-full flex-col items-center gap-0.5 rounded-[var(--musai-radius)] border px-3 py-2.5 pr-7 text-center transition-colors duration-200 ${tone.row}`}
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
                  <span className="truncate text-[13px] font-semibold text-[var(--musai-ink)]">
                    {s.scaleLabel}
                  </span>
                </span>
                <span
                  className={`text-[15px] font-semibold tabular-nums tracking-tight ${tone.score}`}
                >
                  {score}
                </span>
                <span className="text-[10px] text-[var(--musai-muted)]">
                  {formatWhen(s.recordedAt)}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Delete ${s.scaleLabel} take`}
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--musai-surface-2)] text-[var(--musai-muted)] opacity-100 transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--musai-accent-2)_18%,white)] hover:text-[var(--musai-accent-2)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--musai-accent-2)] md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
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
