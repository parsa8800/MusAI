"use client";

import { useEffect, useState } from "react";
import {
  formatLastPractised,
  listScaleProgressJourneys,
  removeScaleProgressJourney,
  type ScaleProgressJourneyV1,
} from "@/lib/scaleProgressHistory";
import { workspaceTitle } from "@/lib/scaleWorkspace";

function bestTone(best: number): {
  row: string;
  best: string;
  dot: string;
} {
  if (best >= 85) {
    return {
      row: "border-[color-mix(in_srgb,var(--musai-ok)_28%,var(--musai-border))] bg-[var(--musai-accent-soft)] hover:brightness-[0.98]",
      best: "text-[var(--musai-ok)]",
      dot: "bg-[var(--musai-ok)]",
    };
  }
  if (best >= 60) {
    return {
      row: "border-[color-mix(in_srgb,var(--musai-warn)_28%,var(--musai-border))] bg-[color-mix(in_srgb,var(--musai-warn)_10%,white)] hover:brightness-[0.98]",
      best: "text-[var(--musai-warn)]",
      dot: "bg-[var(--musai-warn)]",
    };
  }
  return {
    row: "border-[color-mix(in_srgb,var(--musai-accent-2)_28%,var(--musai-border))] bg-[color-mix(in_srgb,var(--musai-accent-2)_10%,white)] hover:brightness-[0.98]",
    best: "text-[var(--musai-accent-2)]",
    dot: "bg-[var(--musai-accent-2)]",
  };
}

function AttemptSpark({ attempts }: { attempts: ScaleProgressJourneyV1["attempts"] }) {
  const recent = attempts.slice(-6);
  if (recent.length < 2) return null;
  return (
    <div
      className="mt-1.5 flex items-end justify-center gap-0.5"
      aria-hidden
      title={recent.map((a) => `${Math.round(a.summary.inTunePercent)}%`).join(" → ")}
    >
      {recent.map((a) => {
        const pct = Math.max(8, Math.min(100, a.summary.inTunePercent));
        return (
          <span
            key={a.sessionId}
            className="w-1 rounded-full bg-[color-mix(in_srgb,var(--musai-accent)_45%,var(--musai-border))]"
            style={{ height: `${6 + (pct / 100) * 14}px` }}
          />
        );
      })}
    </div>
  );
}

/**
 * Scale journeys from local progress history — one row per scale, not per take.
 */
export function ScaleProgressPanel({
  revision = 0,
  onContinue,
  currentProgressKey,
  title = "Your scales",
  subtitle = "Tap a scale to open its page again",
}: {
  /** Bump after new attempts so the list refreshes. */
  revision?: number;
  onContinue: (journey: ScaleProgressJourneyV1) => void;
  /** Mark the open workspace so it isn’t a duplicate destination. */
  currentProgressKey?: string;
  title?: string;
  subtitle?: string;
}) {
  const [journeys, setJourneys] = useState<ScaleProgressJourneyV1[] | null>(
    null,
  );

  useEffect(() => {
    setJourneys(listScaleProgressJourneys());
  }, [revision]);

  const loading = journeys === null;
  const empty = !loading && journeys.length === 0;

  return (
    <section
      className="flex h-full w-full flex-col rounded-[var(--musai-radius-lg)] border border-[var(--musai-border)] bg-[var(--musai-surface)] px-3.5 py-4 shadow-[var(--musai-shadow)] sm:px-4"
      aria-label={title}
    >
      <div className="shrink-0 text-center">
        <p className="font-display text-lg font-semibold tracking-tight text-[var(--musai-ink)]">
          {title}
        </p>
        <p className="mt-1 text-[13px] leading-snug text-[var(--musai-muted)]">
          {subtitle}
        </p>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-10">
          <div
            className="h-8 w-8 rounded-full border-2 border-[var(--musai-border)] border-t-[var(--musai-accent)] motion-safe:animate-spin motion-reduce:animate-none"
            aria-hidden
          />
        </div>
      ) : empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
          <p className="text-[15px] font-semibold text-[var(--musai-ink)]">
            No scales yet
          </p>
          <p className="max-w-[14rem] text-[13px] leading-snug text-[var(--musai-muted)]">
            Record a scale below. It will show up here so you can come back.
          </p>
        </div>
      ) : (
        <ul className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pb-1">
          {journeys.map((j) => {
            const best = Math.round(j.bestInTunePercent);
            const tone = bestTone(best);
            const attemptLabel =
              j.attempts.length === 1
                ? "1 take"
                : `${j.attempts.length} takes`;
            const isCurrent = currentProgressKey === j.progressKey;
            return (
              <li key={j.progressKey} className="group relative">
                <button
                  type="button"
                  disabled={isCurrent}
                  aria-current={isCurrent ? "page" : undefined}
                  className={`flex w-full flex-col items-center gap-0.5 rounded-[var(--musai-radius)] border px-3 py-2.5 pr-7 text-center transition-colors duration-200 ${
                    isCurrent
                      ? "cursor-default border-[color-mix(in_srgb,var(--musai-accent)_35%,var(--musai-border))] bg-[var(--musai-accent-soft)]"
                      : tone.row
                  }`}
                  onClick={() => {
                    if (!isCurrent) onContinue(j);
                  }}
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`}
                      aria-hidden
                    />
                    <span className="truncate text-[14px] font-semibold text-[var(--musai-ink)]">
                      {workspaceTitle(j.scaleLabel, j.lastOctaveSpan)}
                    </span>
                  </span>
                  {isCurrent ? (
                    <span className="text-[12px] font-semibold text-[var(--musai-ok)]">
                      This page
                    </span>
                  ) : (
                    <span
                      className={`text-[12px] font-medium tabular-nums ${tone.best}`}
                    >
                      Best {best}%
                    </span>
                  )}
                  <span className="text-[11px] text-[var(--musai-muted)]">
                    {attemptLabel}
                    <span className="mx-1 text-[var(--musai-border)]">·</span>
                    {formatLastPractised(j.lastPractisedAt)}
                  </span>
                  <AttemptSpark attempts={j.attempts} />
                </button>
                {!isCurrent ? (
                  <button
                    type="button"
                    aria-label={`Delete ${j.scaleLabel} progress`}
                    className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--musai-surface-2)] text-[var(--musai-muted)] opacity-100 transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--musai-accent-2)_18%,white)] hover:text-[var(--musai-accent-2)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--musai-accent-2)] md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      removeScaleProgressJourney(j.progressKey);
                      setJourneys(listScaleProgressJourneys());
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
                      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
