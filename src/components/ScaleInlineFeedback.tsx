"use client";

import { useEffect, useMemo, useState } from "react";
import { CoachChatPanel } from "@/components/CoachChatPanel";
import { buildLoopAttemptMeta } from "@/lib/scalePracticeProgress";
import { buildScaleCoachingFeedback, ensureBulletFeedback } from "@/lib/scalePracticeCopy";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";

function bulletLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^[•*]\s*/, "").trim())
    .filter(Boolean);
}

export type ScaleFocusHints = {
  strong: string;
  next: string;
};

/**
 * Coach-only side panel — play, get feedback. No score chrome.
 */
export function ScaleInlineFeedback({
  session,
  loopAttempts,
  onFocusHints,
}: {
  session: ScalePracticeSessionV1;
  loopAttempts: ScalePracticeSessionV1[];
  /** Strong / next lines for the staff column (updated when coaching loads). */
  onFocusHints?: (hints: ScaleFocusHints) => void;
}) {
  const template = useMemo(() => buildScaleCoachingFeedback(session), [session]);
  const [tip, setTip] = useState(template.tip);
  const [trendLine, setTrendLine] = useState(template.trendLine);
  const [tipSource, setTipSource] = useState<"template" | "llm">("template");
  const [coachReady, setCoachReady] = useState(false);

  const loopMeta = useMemo(
    () => buildLoopAttemptMeta(loopAttempts),
    [loopAttempts],
  );

  const strengthLine = template.strengths[0] ?? "You finished the take";
  const improveLine =
    bulletLines(tip)[0] ??
    (template.focusNotes[0]
      ? `Practise ${template.focusNotes[0].label} slowly`
      : "Keep a steady bow");

  useEffect(() => {
    onFocusHints?.({ strong: strengthLine, next: improveLine });
  }, [improveLine, onFocusHints, strengthLine]);

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

  return (
    <div
      key={session.sessionId}
      className="flex h-full min-h-0 flex-col gap-3"
    >
      <p className="shrink-0 text-center font-display text-lg font-semibold tracking-tight text-[var(--musai-ink)] sm:text-xl">
        Take {loopMeta.attemptNumber}
      </p>

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
