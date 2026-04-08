"use client";

import Link from "next/link";
import { Fragment } from "react";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";
import {
  noteRowHint,
  trendSentence,
  weakestIntro,
} from "@/lib/scalePracticeCopy";

function bucketStyle(bucket: string): string {
  switch (bucket) {
    case "in_tune":
      return "text-emerald-400/95";
    case "sharp":
      return "text-amber-400/95";
    case "flat":
      return "text-violet-400/95";
    default:
      return "text-zinc-500";
  }
}

function bucketLabel(bucket: string): string {
  switch (bucket) {
    case "in_tune":
      return "In tune";
    case "sharp":
      return "Sharp";
    case "flat":
      return "Flat";
    default:
      return "—";
  }
}

export function ScalePracticeResultsView({
  session,
}: {
  session: ScalePracticeSessionV1;
}) {
  const { summary, notes, scaleLabel, octaveRangeLabel, expectedNotesMidi } =
    session;
  /** Up + down ends on the same pitch as the start; older sessions may be ascent-only. */
  const isRoundTripExercise =
    expectedNotesMidi.length >= 3 &&
    expectedNotesMidi[0] === expectedNotesMidi[expectedNotesMidi.length - 1];
  const ascendingSteps = isRoundTripExercise
    ? (expectedNotesMidi.length + 1) / 2
    : expectedNotesMidi.length;

  return (
    <div className="w-full max-w-lg space-y-8">
      <header className="text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-sky-400/85">
          Scale practice
        </p>
        <h1 className="mt-2 bg-gradient-to-br from-white via-white to-zinc-400 bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-3xl">
          Session readout
        </h1>
        <p className="mx-auto mt-3 max-w-[340px] text-[13px] leading-relaxed text-zinc-500">
          {scaleLabel} · {octaveRangeLabel}.           {isRoundTripExercise
            ? "This session followed the guided pattern (up, then down). Each row matches one step in that order — data is stored for future coaching."
            : "Note-by-note data is stored for future coaching. Older sessions may be ascent-only."}
        </p>
      </header>

      <section className="rounded-[1.25rem] border border-white/[0.1] bg-white/[0.04] px-5 py-8 shadow-[0_16px_48px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-xl sm:px-8">
        <div className="flex flex-col items-center gap-2 border-b border-white/[0.08] pb-6 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Overall
          </p>
          <p className="text-5xl font-semibold tabular-nums text-white">
            {summary.overallScore0to100}
          </p>
          <p className="text-xs text-zinc-500">
            Avg |Δ| {summary.averageAbsCents}¢ ·{" "}
            {summary.inTunePercent}% in tune · {summary.notesAnalyzed} notes
            {summary.notesMissing > 0
              ? ` · ${summary.notesMissing} unclear`
              : ""}
          </p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-zinc-400">
            {trendSentence(summary.trend)}
          </p>
        </div>

        {summary.weakestNoteIndices.length > 0 ? (
          <div className="border-b border-white/[0.08] py-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              {weakestIntro()}
            </p>
            <ul className="mt-2 flex flex-wrap justify-center gap-2">
              {summary.weakestNoteIndices.map((idx) => {
                const row = notes.find((n) => n.noteIndex === idx);
                if (!row) return null;
                return (
                  <li
                    key={idx}
                    className="rounded-full border border-white/[0.1] bg-black/25 px-3 py-1 text-xs text-zinc-300"
                  >
                    {row.expectedNoteLabel}{" "}
                    <span className="text-zinc-500">
                      ({row.missingData ? "?" : `${row.centsDifference > 0 ? "+" : ""}${row.centsDifference}¢`}
                      )
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="pt-5">
          <p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Note by note
          </p>
          <ul className="max-h-[min(52vh,420px)] space-y-2 overflow-y-auto pr-1">
            {isRoundTripExercise ? (
              <li className="list-none py-1 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
                Ascending
              </li>
            ) : null}
            {notes.map((row) => (
              <Fragment key={row.noteIndex}>
                {isRoundTripExercise && row.noteIndex === ascendingSteps ? (
                  <li className="list-none py-1 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
                    Descending
                  </li>
                ) : null}
                <li className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-left text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-zinc-200">
                      {row.noteIndex + 1}. {row.expectedNoteLabel}
                      <span className="font-normal text-zinc-500">
                        {" "}
                        → heard {row.missingData ? "—" : row.detectedNoteLabel}
                      </span>
                    </span>
                    <span
                      className={`text-xs font-semibold uppercase tracking-wide ${bucketStyle(row.intonationBucket)}`}
                    >
                      {bucketLabel(row.intonationBucket)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                    {row.missingData
                      ? noteRowHint(row)
                      : `${row.centsDifference > 0 ? "+" : ""}${row.centsDifference}¢ · ${row.detectedHz.toFixed(1)} Hz · ${noteRowHint(row)}`}
                  </p>
                </li>
              </Fragment>
            ))}
          </ul>
        </div>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/practice/scale"
            className="w-full max-w-xs rounded-full border border-sky-400/25 bg-gradient-to-b from-sky-400 to-sky-600 py-3.5 text-center text-sm font-semibold text-zinc-950 shadow-[0_8px_28px_rgba(14,165,233,0.3),inset_0_1px_0_rgba(255,255,255,0.35)] transition hover:from-sky-300 hover:to-sky-500 sm:w-auto sm:min-w-[200px] sm:py-3"
          >
            Another scale
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-zinc-500 underline-offset-4 transition hover:text-white hover:underline"
          >
            Home
          </Link>
        </div>
      </section>

      <details className="rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-3 text-left text-xs text-zinc-500">
        <summary className="cursor-pointer font-medium text-zinc-400">
          Structured session data (for developers / future AI)
        </summary>
        <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-black/40 p-3 font-mono text-[10px] leading-relaxed text-zinc-400">
          {JSON.stringify(session, null, 2)}
        </pre>
      </details>
    </div>
  );
}
