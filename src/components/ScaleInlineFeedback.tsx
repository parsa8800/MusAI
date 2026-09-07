"use client";

import { useEffect, useMemo, useState } from "react";
import { CoachChatPanel } from "@/components/CoachChatPanel";
import { AnimatedReveal } from "@/components/motion/AnimatedReveal";
import {
  buildAttemptProgress,
  buildLoopAttemptMeta,
  practiceStageFromSummary,
} from "@/lib/scalePracticeProgress";
import { buildScaleCoachingFeedback, ensureBulletFeedback } from "@/lib/scalePracticeCopy";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";

function bulletLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^[•*]\s*/, "").trim())
    .filter(Boolean);
}

function formatDeltaPct(delta: number): string {
  if (delta > 0) return `+${delta}%`;
  if (delta < 0) return `${delta}%`;
  return "Same";
}

/**
 * Compact coaching + progress that sits under the staff on a scale workspace.
 * Does not replace notation or the record control.
 */
export function ScaleInlineFeedback({
  session,
  loopAttempts,
}: {
  session: ScalePracticeSessionV1;
  loopAttempts: ScalePracticeSessionV1[];
}) {
  const template = useMemo(() => buildScaleCoachingFeedback(session), [session]);
  const [tip, setTip] = useState(template.tip);
  const [trendLine, setTrendLine] = useState(template.trendLine);
  const [tipSource, setTipSource] = useState<"template" | "llm">("template");
  const [coachReady, setCoachReady] = useState(false);

  const stage = useMemo(
    () => practiceStageFromSummary(session.summary),
    [session.summary],
  );
  const loopMeta = useMemo(
    () => buildLoopAttemptMeta(loopAttempts),
    [loopAttempts],
  );
  const progress = useMemo(() => {
    const previous =
      loopAttempts.length >= 2
        ? loopAttempts[loopAttempts.length - 2]!
        : null;
    return buildAttemptProgress(session, previous);
  }, [loopAttempts, session]);

  useEffect(() => {
    setTip(template.tip);
    setTrendLine(template.trendLine);
    setTipSource("template");
    setCoachReady(false);
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/scale-coaching", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session }),
        });
        if (cancelled || !res.ok) return;
        const data = (await res.json()) as {
          tip?: string;
          trendLine?: string;
          source?: "llm" | "template";
        };
        if (cancelled) return;
        if (typeof data.trendLine === "string" && data.trendLine.trim()) {
          setTrendLine(ensureBulletFeedback(data.trendLine));
        }
        if (typeof data.tip === "string" && data.tip.trim()) {
          setTip(ensureBulletFeedback(data.tip));
        }
        if (data.source === "llm" || data.source === "template") {
          setTipSource(data.source);
        }
      } catch {
        /* template */
      } finally {
        if (!cancelled) setCoachReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, template.tip, template.trendLine]);

  const strengthLine = template.strengths[0] ?? "You finished the take";
  const improveLine =
    bulletLines(tip)[0] ??
    (template.focusNotes[0]
      ? `Practise ${template.focusNotes[0].label} slowly`
      : "Keep a steady bow");

  const progressTone =
    progress.kind === "up"
      ? "text-[var(--musai-ok)]"
      : progress.kind === "down"
        ? "text-[var(--musai-ink)]"
        : "text-[var(--musai-muted)]";

  return (
    <AnimatedReveal
      key={session.sessionId}
      className="space-y-4"
      delay={40}
    >
      <div className="musai-glass-panel space-y-3 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[var(--musai-border)] bg-[var(--musai-surface-2)] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-[var(--musai-ink)]">
            Take {loopMeta.attemptNumber}
          </span>
          <span className="text-[12px] font-medium text-[var(--musai-muted)]">
            {stage.label}
          </span>
          {loopMeta.deltaPct != null && loopMeta.deltaPct !== 0 ? (
            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums ${
                loopMeta.deltaPct > 0
                  ? "border-[color-mix(in_srgb,var(--musai-ok)_28%,var(--musai-border))] bg-[var(--musai-accent-soft)] text-[var(--musai-ok)]"
                  : "border-[var(--musai-border)] bg-[var(--musai-surface-2)] text-[var(--musai-muted)]"
              }`}
            >
              {formatDeltaPct(loopMeta.deltaPct)} from previous
            </span>
          ) : null}
          {loopMeta.isNewBest ? (
            <span className="rounded-full border border-[color-mix(in_srgb,var(--musai-ok)_28%,var(--musai-border))] bg-[var(--musai-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--musai-ok)]">
              New best
            </span>
          ) : null}
          <span className="text-[11px] tabular-nums text-[var(--musai-muted)]">
            Best {Math.round(loopMeta.bestAccuracy)}%
          </span>
        </div>
        <p className={`text-[14px] font-semibold leading-snug ${progressTone}`}>
          {progress.line}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-[var(--musai-radius)] border border-[color-mix(in_srgb,var(--musai-ok)_18%,var(--musai-border))] bg-[var(--musai-accent-soft)] px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--musai-ok)]">
              Strongest
            </p>
            <p className="mt-0.5 text-[13px] font-medium text-[var(--musai-ink)]">
              {strengthLine}
            </p>
          </div>
          <div className="rounded-[var(--musai-radius)] border border-[color-mix(in_srgb,var(--musai-key-sharp)_22%,var(--musai-border))] bg-[var(--musai-key-sharp-soft)] px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--musai-key-sharp)]">
              Next
            </p>
            <p className="mt-0.5 text-[13px] font-medium text-[var(--musai-ink)]">
              {improveLine}
            </p>
          </div>
        </div>
        <p className="text-[12px] tabular-nums text-[var(--musai-muted)]">
          This take{" "}
          <span className="font-medium text-[var(--musai-ink)]">
            {Math.round(session.summary.inTunePercent)}%
          </span>
        </p>
      </div>

      <div className="musai-glass-panel min-h-[14rem] px-4 py-4 sm:px-5 sm:py-5">
        {coachReady ? (
          <CoachChatPanel
            embed
            start
            title="Coach · Parsa"
            trendLine={trendLine}
            tip={tip}
            source={tipSource}
            session={session}
          />
        ) : (
          <div className="flex min-h-[12rem] flex-col items-center justify-center gap-2 text-center">
            <div
              className="h-7 w-7 rounded-full border-2 border-[var(--musai-border)] border-t-[var(--musai-accent)] motion-safe:animate-spin motion-reduce:animate-none"
              aria-hidden
            />
            <p className="font-display text-base font-semibold text-[var(--musai-ink)]">
              Coach · Parsa
            </p>
          </div>
        )}
      </div>
    </AnimatedReveal>
  );
}
