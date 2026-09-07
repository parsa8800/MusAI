"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CoachChatPanel } from "@/components/CoachChatPanel";
import { AnimatedReveal } from "@/components/motion/AnimatedReveal";
import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import { PracticeStageRing } from "@/components/PracticeStageRing";
import { ScaleTrebleStaff } from "@/components/ScaleTrebleStaff";
import { alignExpectedMidisToDetectedOctave } from "@/lib/alignScaleOctave";
import { buildScaleCoachingFeedback, ensureBulletFeedback } from "@/lib/scalePracticeCopy";
import {
  buildAttemptProgress,
  buildLoopAttemptMeta,
  findPreviousComparableTake,
  practiceStageFromSummary,
  type LoopAttemptMeta,
} from "@/lib/scalePracticeProgress";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";

function bulletLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^[•*]\s*/, "").trim())
    .filter(Boolean);
}

function octaveCaption(span: 1 | 2): string {
  return span === 2 ? "2 octaves" : "1 octave";
}

function formatDeltaPct(delta: number): string {
  if (delta > 0) return `+${delta}% from previous`;
  if (delta < 0) return `${delta}% from previous`;
  return "Same as previous";
}

/**
 * Scale results: progress + coaching first; pitch accuracy stays secondary.
 * When `onTryAgain` is set, retry stays in the live practice loop.
 */
export function ScalePracticeResultsView({
  session,
  loopAttempts,
  onTryAgain,
  tryAgainLabel = "Try again",
  studioHref = "/practice/scale",
}: {
  session: ScalePracticeSessionV1;
  /** Chronological attempts in the current loop (includes `session`). */
  loopAttempts?: ScalePracticeSessionV1[];
  onTryAgain?: () => void;
  tryAgainLabel?: string;
  studioHref?: string;
}) {
  const { summary, notes, scaleLabel, expectedNotesMidi, octaveSpan } = session;
  const [scoreBoot, setScoreBoot] = useState(true);
  const [ready, setReady] = useState(false);
  const [chatStart, setChatStart] = useState(false);
  const template = useMemo(() => buildScaleCoachingFeedback(session), [session]);
  const [trendLine, setTrendLine] = useState(template.trendLine);
  const [tip, setTip] = useState(template.tip);
  const [tipSource, setTipSource] = useState<"template" | "llm">("template");
  const [coachReady, setCoachReady] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const stage = useMemo(() => practiceStageFromSummary(summary), [summary]);

  const loopMeta: LoopAttemptMeta | null = useMemo(() => {
    if (!loopAttempts?.length) return null;
    return buildLoopAttemptMeta(loopAttempts);
  }, [loopAttempts]);

  const progress = useMemo(() => {
    const previousInLoop =
      loopAttempts && loopAttempts.length >= 2
        ? loopAttempts[loopAttempts.length - 2]!
        : null;
    const previous =
      previousInLoop ?? findPreviousComparableTake(session);
    return buildAttemptProgress(session, previous);
  }, [loopAttempts, session]);

  useEffect(() => {
    setScoreBoot(true);
    setReady(false);
    setChatStart(false);
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = reduce ? 0 : 720;
    const t = window.setTimeout(() => {
      setScoreBoot(false);
      setReady(true);
    }, delay);
    return () => window.clearTimeout(t);
  }, [session.sessionId]);

  useEffect(() => {
    if (scoreBoot) {
      setChatStart(false);
      return;
    }
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setChatStart(true);
      return;
    }
    const t = window.setTimeout(() => setChatStart(true), 900);
    return () => window.clearTimeout(t);
  }, [scoreBoot, session.sessionId]);

  useEffect(() => {
    setTrendLine(template.trendLine);
    setTip(template.tip);
    setTipSource("template");
    setAiError(null);
    setCoachReady(false);

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/scale-coaching", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session }),
        });
        if (cancelled) return;
        if (!res.ok) return;
        const data = (await res.json()) as {
          tip?: string;
          trendLine?: string;
          source?: "llm" | "template";
          error?: string;
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
        if (typeof data.error === "string" && data.error.trim()) {
          setAiError(data.error);
        } else if (data.source === "llm") {
          setAiError(null);
        }
      } catch {
        /* keep template */
      } finally {
        if (!cancelled) setCoachReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, template.tip, template.trendLine]);

  const split = useMemo(() => {
    const displayMidis = alignExpectedMidisToDetectedOctave(
      expectedNotesMidi,
      notes,
    );
    const n = displayMidis.length;
    const looksRoundTrip = n >= 3 && displayMidis[0] === displayMidis[n - 1];
    const ascendingSteps = looksRoundTrip ? (n + 1) / 2 : n;
    const ascMidis = displayMidis.slice(0, ascendingSteps);
    const descMidis = looksRoundTrip ? displayMidis.slice(ascendingSteps) : [];
    const ascNotes = notes.slice(0, ascendingSteps);
    const descNotes = looksRoundTrip ? notes.slice(ascendingSteps) : [];
    return { ascMidis, descMidis, ascNotes, descNotes };
  }, [expectedNotesMidi, notes]);

  const ascCents = useMemo(
    () => split.ascNotes.map((r) => (r.missingData ? null : r.centsDifference)),
    [split.ascNotes],
  );
  const descCents = useMemo(
    () => split.descNotes.map((r) => (r.missingData ? null : r.centsDifference)),
    [split.descNotes],
  );

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

  const inLoop = Boolean(onTryAgain);

  return (
    <AnimatedReveal
      key={session.sessionId}
      className={`w-full max-w-[min(1180px,100%)] space-y-6 sm:space-y-7 ${
        ready ? "musai-results-ready" : ""
      }`}
      delay={30}
    >
      {inLoop ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] font-medium text-[var(--musai-muted)]">
            Same scale · keep going
          </p>
          <Link
            href={studioHref}
            className="text-[12px] font-medium text-[var(--musai-muted)] underline decoration-[var(--musai-border)] underline-offset-2 hover:text-[var(--musai-ink)]"
          >
            Scale studio
          </Link>
        </div>
      ) : (
        <PracticeHubBackLink
          href={studioHref}
          label="Scale studio"
          ariaLabel="Back to Scale studio"
        />
      )}

      <header
        data-anime-enter
        className="musai-glass-panel flex flex-col gap-5 px-5 py-5 sm:px-7 sm:py-6"
      >
        {loopMeta ? (
          <div
            className="flex flex-wrap items-center gap-2"
            aria-label={`Take ${loopMeta.attemptNumber}`}
          >
            <span className="rounded-full border border-[var(--musai-border)] bg-[var(--musai-surface-2)] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-[var(--musai-ink)]">
              Take {loopMeta.attemptNumber}
            </span>
            {loopMeta.deltaPct != null && loopMeta.deltaPct !== 0 ? (
              <span
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums ${
                  loopMeta.deltaPct > 0
                    ? "border-[color-mix(in_srgb,var(--musai-ok)_28%,var(--musai-border))] bg-[var(--musai-accent-soft)] text-[var(--musai-ok)]"
                    : "border-[var(--musai-border)] bg-[var(--musai-surface-2)] text-[var(--musai-muted)]"
                }`}
              >
                {formatDeltaPct(loopMeta.deltaPct)}
              </span>
            ) : null}
            {loopMeta.isNewBest ? (
              <span className="rounded-full border border-[color-mix(in_srgb,var(--musai-ok)_28%,var(--musai-border))] bg-[var(--musai-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--musai-ok)]">
                New best
              </span>
            ) : null}
            {!loopMeta.isFirst ? (
              <span className="text-[11px] tabular-nums text-[var(--musai-muted)]">
                Best so far {loopMeta.bestAccuracy}%
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
          <div className="flex shrink-0 items-center gap-4 sm:gap-5">
            <PracticeStageRing
              fill={stage.fill}
              label={stage.label}
              loading={scoreBoot}
              size={118}
            />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--musai-muted)]">
                This take
              </p>
              <p
                className={`mt-1.5 text-[15px] font-semibold leading-snug ${progressTone}`}
              >
                {progress.line}
              </p>
              <p className="mt-2 text-[12px] tabular-nums text-[var(--musai-muted)]">
                Pitch accuracy{" "}
                <span className="font-medium text-[var(--musai-ink)]">
                  {Math.round(summary.inTunePercent)}%
                </span>
              </p>
            </div>
          </div>

          <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
            <div className="rounded-[var(--musai-radius)] border border-[color-mix(in_srgb,var(--musai-ok)_22%,var(--musai-border))] bg-[var(--musai-accent-soft)] px-3.5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--musai-ok)]">
                Strongest
              </p>
              <p className="mt-1 text-[13px] font-medium leading-snug text-[var(--musai-ink)]">
                {strengthLine}
              </p>
            </div>
            <div className="rounded-[var(--musai-radius)] border border-[color-mix(in_srgb,var(--musai-key-sharp)_28%,var(--musai-border))] bg-[var(--musai-key-sharp-soft)] px-3.5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--musai-key-sharp)]">
                Next
              </p>
              <p className="mt-1 text-[13px] font-medium leading-snug text-[var(--musai-ink)]">
                {improveLine}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div
        data-anime-enter
        className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:items-stretch lg:gap-6"
      >
        <section
          className="musai-glass-panel flex flex-col px-4 py-5 sm:px-6 sm:py-6"
          aria-label="Colour-coded note feedback"
        >
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-xl font-semibold tracking-tight text-[var(--musai-ink)] sm:text-2xl">
                {scaleLabel}
              </h1>
              <p className="mt-0.5 text-[13px] font-medium text-[var(--musai-muted)]">
                {octaveCaption(octaveSpan)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--musai-muted)]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[var(--musai-ok)]" /> On pitch
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[var(--musai-warn)]" /> Sharp
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[var(--musai-key-flat)]" /> Flat
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[var(--musai-accent-2)]" /> Missed
              </span>
            </div>
          </div>

          <div className="musai-rv-details min-w-0 flex-1">
            <ScaleTrebleStaff
              ascendingMidis={split.ascMidis}
              descendingMidis={split.descMidis}
              ascendingCents={ascCents}
              descendingCents={descCents}
              tonicPitchClass={session.tonicPitchClass}
              scaleKind={session.scaleKind}
            />
          </div>
        </section>

        <aside className="musai-glass-panel flex min-h-[22rem] flex-col px-4 py-5 sm:min-h-[28rem] sm:px-5 sm:py-6 lg:min-h-[32rem]">
          {chatStart && coachReady ? (
            <CoachChatPanel
              embed
              start
              title="Coach · Parsa"
              trendLine={trendLine}
              tip={tip}
              source={tipSource}
              session={session}
              initialError={aiError}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <div
                className="h-8 w-8 rounded-full border-2 border-[var(--musai-border)] border-t-[var(--musai-accent)] motion-safe:animate-spin motion-reduce:animate-none"
                aria-hidden
              />
              <p className="font-display text-lg font-semibold text-[var(--musai-ink)]">
                Coach · Parsa
              </p>
            </div>
          )}
        </aside>
      </div>

      <div
        data-anime-enter
        className="flex flex-wrap items-center justify-center gap-3"
      >
        {onTryAgain ? (
          <button type="button" onClick={onTryAgain} className="musai-btn-primary">
            {tryAgainLabel}
          </button>
        ) : (
          <Link href={studioHref} className="musai-btn-primary">
            {tryAgainLabel}
          </Link>
        )}
        <Link href="/" className="musai-btn-secondary">
          Practice hub
        </Link>
      </div>
    </AnimatedReveal>
  );
}
