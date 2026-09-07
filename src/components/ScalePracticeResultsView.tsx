"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CoachChatPanel } from "@/components/CoachChatPanel";
import { AnimatedReveal } from "@/components/motion/AnimatedReveal";
import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import { ScoreRing } from "@/components/ScoreRing";
import { ScaleTrebleStaff } from "@/components/ScaleTrebleStaff";
import { alignExpectedMidisToDetectedOctave } from "@/lib/alignScaleOctave";
import { buildScaleCoachingFeedback, ensureBulletFeedback } from "@/lib/scalePracticeCopy";
import { clearScalePracticeSession, formatScaleTakeSubtitle } from "@/lib/scalePracticeSession";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";

function summaryLabel(inTunePercent: number, trend: "sharp" | "flat" | "balanced"): string {
  if (inTunePercent >= 90) return "Excellent";
  if (inTunePercent >= 75) return "Good control";
  if (inTunePercent >= 55) return trend === "balanced" ? "Getting better" : `Mostly ${trend}`;
  return "Needs work";
}

function bulletLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^[•*]\s*/, "").trim())
    .filter(Boolean);
}

function focusTone(bucket: string): string {
  if (bucket === "sharp") return "text-[var(--musai-warn)] bg-[color-mix(in_srgb,var(--musai-warn)_12%,white)] border-[color-mix(in_srgb,var(--musai-warn)_28%,var(--musai-border))]";
  if (bucket === "flat") return "text-[var(--musai-key-flat)] bg-[var(--musai-key-flat-soft)] border-[color-mix(in_srgb,var(--musai-key-flat)_28%,var(--musai-border))]";
  if (bucket === "in_tune") return "text-[var(--musai-ok)] bg-[var(--musai-accent-soft)] border-[color-mix(in_srgb,var(--musai-ok)_28%,var(--musai-border))]";
  return "text-[var(--musai-accent-2)] bg-[color-mix(in_srgb,var(--musai-accent-2)_10%,white)] border-[color-mix(in_srgb,var(--musai-accent-2)_28%,var(--musai-border))]";
}

/**
 * Scale results: visual staff always on, coach beside it on desktop.
 * High-level strip stays tiny — notes + chat carry the detail.
 */
export function ScalePracticeResultsView({
  session,
}: {
  session: ScalePracticeSessionV1;
}) {
  const { summary, notes, scaleLabel, expectedNotesMidi } = session;
  const [scoreBoot, setScoreBoot] = useState(true);
  const [ready, setReady] = useState(false);
  const [chatStart, setChatStart] = useState(false);
  const template = useMemo(() => buildScaleCoachingFeedback(session), [session]);
  const [trendLine, setTrendLine] = useState(template.trendLine);
  const [tip, setTip] = useState(template.tip);
  const [tipSource, setTipSource] = useState<"template" | "llm">("template");
  const [coachReady, setCoachReady] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
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
  }, []);

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
  }, [scoreBoot]);

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

  const strengthLine = template.strengths[0] ?? "Completed a full take";
  const improveLine =
    bulletLines(tip)[0] ??
    (template.focusNotes[0]
      ? `Work ${template.focusNotes[0].label}`
      : "Keep the same pulse");

  return (
    <AnimatedReveal
      className={`w-full max-w-[min(1180px,100%)] space-y-6 sm:space-y-7 ${
        ready ? "musai-results-ready" : ""
      }`}
      delay={30}
    >
      <PracticeHubBackLink
        href="/practice/scale"
        label="Scale studio"
        ariaLabel="Back to Scale studio"
      />

      <header
        data-anime-enter
        className="musai-glass-panel flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-center sm:gap-8 sm:px-7 sm:py-6"
      >
        <div className="flex shrink-0 items-center gap-4 sm:gap-5">
          <ScoreRing
            score={summary.overallScore0to100}
            size={108}
            label="Score"
            resultsMode
            resultsLoading={scoreBoot}
            resultsRevealMs={1800}
          />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--musai-muted)]">
              Scale feedback
            </p>
            <h1 className="font-display mt-1 text-2xl font-semibold tracking-tight text-[var(--musai-ink)] sm:text-[1.75rem]">
              {scaleLabel}
            </h1>
            <p className="mt-1 text-sm text-[var(--musai-muted)]">
              {summaryLabel(summary.inTunePercent, summary.trend)}
              <span className="text-[var(--musai-border)]"> · </span>
              {formatScaleTakeSubtitle(session)}
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
          <div className="rounded-[var(--musai-radius)] border border-[color-mix(in_srgb,var(--musai-accent-2)_22%,var(--musai-border))] bg-[color-mix(in_srgb,var(--musai-accent-2)_6%,white)] px-3.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--musai-accent-2)]">
              Next
            </p>
            <p className="mt-1 text-[13px] font-medium leading-snug text-[var(--musai-ink)]">
              {improveLine}
            </p>
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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="font-display text-lg font-semibold tracking-tight text-[var(--musai-ink)]">
              Your notes
            </p>
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

          {template.focusNotes.length > 0 ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {template.focusNotes.map((n) => (
                <span
                  key={`${n.noteIndex}-${n.label}`}
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[12px] font-semibold ${focusTone(n.bucket)}`}
                >
                  {n.label}
                  {n.bucket === "sharp"
                    ? " ↑"
                    : n.bucket === "flat"
                      ? " ↓"
                      : n.centsLabel === "—"
                        ? " · ?"
                        : ""}
                </span>
              ))}
            </div>
          ) : null}

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
                Coach
              </p>
            </div>
          )}
        </aside>
      </div>

      <div
        data-anime-enter
        className="flex flex-wrap items-center justify-center gap-3"
      >
        <Link
          href="/practice/scale"
          onClick={() => clearScalePracticeSession()}
          className="musai-btn-primary"
        >
          Retry
        </Link>
        <Link
          href="/"
          onClick={() => clearScalePracticeSession()}
          className="musai-btn-secondary"
        >
          Practice hub
        </Link>
      </div>
    </AnimatedReveal>
  );
}
