"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CoachChatPanel } from "@/components/CoachChatPanel";
import { AnimatedReveal } from "@/components/motion/AnimatedReveal";
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
  return "Needs tuning";
}

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
    const delay = reduce ? 0 : 880;
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
    const t = window.setTimeout(() => setChatStart(true), 2100);
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
    // Staff pitch follows the take’s octave (analysis may unwrap octaves for score).
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

  return (
    <AnimatedReveal className="w-full max-w-4xl space-y-8" delay={40}>
      <header data-anime-enter className="text-center">
        <h1 className="bg-gradient-to-br from-white via-white to-zinc-400 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
          {scaleLabel}
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          {formatScaleTakeSubtitle(session)}
        </p>
        <p className="mt-1 text-[11px] text-zinc-600">
          Wrong scale?{" "}
          <Link
            href="/practice/scale"
            className="font-medium text-zinc-400 underline decoration-zinc-600 underline-offset-2 hover:text-zinc-200"
            onClick={() => clearScalePracticeSession()}
          >
            Pick another in Scale studio
          </Link>
        </p>
      </header>

      <section
        data-anime-enter
        className={`musai-results-card musai-results-card-breathe rounded-[1.75rem] border border-white/[0.1] bg-white/[0.04] px-5 py-8 shadow-[0_18px_56px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-xl sm:px-10 sm:py-10 ${
          ready ? "musai-results-ready" : ""
        }`}
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center text-center">
          <div className="relative mx-auto flex justify-center pt-1">
            <div
              className="pointer-events-none absolute -inset-6 rounded-full opacity-60 blur-3xl motion-reduce:opacity-0"
              style={{
                background:
                  "radial-gradient(circle at 50% 50%, rgba(52,211,153,0.14) 0%, rgba(250,204,21,0.06) 42%, transparent 68%)",
              }}
              aria-hidden
            />
            <ScoreRing
              score={summary.overallScore0to100}
              size={210}
              label="Score"
              resultsMode
              resultsLoading={scoreBoot}
              resultsRevealMs={2400}
            />
          </div>

          <div className="musai-rv-title mt-5 space-y-2">
            <p className="text-sm font-semibold text-zinc-200">
              {summaryLabel(summary.inTunePercent, summary.trend)}
            </p>
          </div>

          <div className="musai-rv-body mt-5 flex flex-wrap items-center justify-center gap-4 text-[11px] text-zinc-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> On pitch
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" /> Slightly off
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Out of tune
            </span>
          </div>
        </div>

        <div className="musai-rv-details mt-8">
          <ScaleTrebleStaff
            ascendingMidis={split.ascMidis}
            descendingMidis={split.descMidis}
            ascendingCents={ascCents}
            descendingCents={descCents}
            tonicPitchClass={session.tonicPitchClass}
            scaleKind={session.scaleKind}
          />
        </div>

        <CoachChatPanel
          start={chatStart && coachReady}
          trendLine={trendLine}
          tip={tip}
          source={tipSource}
          session={session}
          initialError={aiError}
        />
      </section>

      <div data-anime-enter className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Link
          href="/practice/scale"
          onClick={() => clearScalePracticeSession()}
          className="w-full max-w-xs rounded-full border border-sky-400/25 bg-gradient-to-b from-sky-400 to-sky-600 py-3.5 text-center text-sm font-semibold text-zinc-950 shadow-[0_8px_28px_rgba(14,165,233,0.3),inset_0_1px_0_rgba(255,255,255,0.35)] transition hover:from-sky-300 hover:to-sky-500 sm:w-auto sm:min-w-[200px] sm:py-3"
        >
          Try again
        </Link>
        <Link
          href="/"
          onClick={() => clearScalePracticeSession()}
          className="text-sm font-medium text-zinc-400 underline-offset-4 transition hover:text-white hover:underline"
        >
          Change exercise
        </Link>
      </div>
    </AnimatedReveal>
  );
}
