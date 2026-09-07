"use client";

import { useEffect, useMemo, useState } from "react";
import { CoachChatPanel } from "@/components/CoachChatPanel";
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
 * Side-panel coaching for the pad layout — fills height, no page scroll.
 */
export function ScaleInlineFeedback({
  session,
  loopAttempts,
  compact = false,
}: {
  session: ScalePracticeSessionV1;
  loopAttempts: ScalePracticeSessionV1[];
  compact?: boolean;
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
    <div
      key={session.sessionId}
      className={`flex h-full min-h-0 flex-col gap-2 ${compact ? "" : "gap-3"}`}
    >
      <div className="shrink-0 space-y-1.5 rounded-[var(--musai-radius)] border border-[var(--musai-border)] bg-[var(--musai-surface)] px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-[var(--musai-border)] bg-[var(--musai-surface-2)] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--musai-ink)]">
            Take {loopMeta.attemptNumber}
          </span>
          <span className="text-[11px] font-medium text-[var(--musai-muted)]">
            {stage.label}
          </span>
          {loopMeta.deltaPct != null && loopMeta.deltaPct !== 0 ? (
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
                loopMeta.deltaPct > 0
                  ? "border-[color-mix(in_srgb,var(--musai-ok)_28%,var(--musai-border))] bg-[var(--musai-accent-soft)] text-[var(--musai-ok)]"
                  : "border-[var(--musai-border)] bg-[var(--musai-surface-2)] text-[var(--musai-muted)]"
              }`}
            >
              {formatDeltaPct(loopMeta.deltaPct)}
            </span>
          ) : null}
          {loopMeta.isNewBest ? (
            <span className="rounded-full border border-[color-mix(in_srgb,var(--musai-ok)_28%,var(--musai-border))] bg-[var(--musai-accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--musai-ok)]">
              New best
            </span>
          ) : null}
          <span className="ml-auto text-[11px] tabular-nums text-[var(--musai-muted)]">
            Best {Math.round(loopMeta.bestAccuracy)}% · This{" "}
            {Math.round(session.summary.inTunePercent)}%
          </span>
        </div>
        <p className={`text-[12px] font-semibold leading-snug ${progressTone}`}>
          {progress.line}
        </p>
        {compact ? (
          <p className="text-[11px] leading-snug text-[var(--musai-muted)]">
            <span className="font-medium text-[var(--musai-ok)]">Strong:</span>{" "}
            {strengthLine}
            <span className="mx-1.5 text-[var(--musai-border)]">·</span>
            <span className="font-medium text-[var(--musai-key-sharp)]">Next:</span>{" "}
            {improveLine}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            <div className="rounded-[var(--musai-radius)] bg-[var(--musai-accent-soft)] px-2 py-1.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--musai-ok)]">
                Strongest
              </p>
              <p className="mt-0.5 text-[12px] font-medium leading-snug text-[var(--musai-ink)]">
                {strengthLine}
              </p>
            </div>
            <div className="rounded-[var(--musai-radius)] bg-[var(--musai-key-sharp-soft)] px-2 py-1.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--musai-key-sharp)]">
                Next
              </p>
              <p className="mt-0.5 text-[12px] font-medium leading-snug text-[var(--musai-ink)]">
                {improveLine}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="musai-glass-panel flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3">
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
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
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
    </div>
  );
}
