import type {
  ScalePracticeNoteRow,
  ScalePracticeSessionV1,
  ScalePracticeSummary,
  ScalePracticeTrend,
} from "@/lib/scalePracticeTypes";
import { SCALE_IN_TUNE_CENTS } from "@/lib/analyzeScalePerformance";

/** Human-facing strings only; keep separate from numeric session payload for AI layer. */

/** Strip dashes from coach copy so feedback never uses -, –, or —. Preserves newlines. */
export function sanitizeCoachFeedback(text: string): string {
  return text
    .split(/\n/)
    .map((line) =>
      line
        .replace(/[\u002D\u00AD\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, " ")
        .replace(/\s+/g, " ")
        .replace(/\s+([.,!?])/g, "$1")
        .replace(/^[•*]\s*/, "")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

/** Always format coach copy as short • bullet lines (no dashes). */
export function toBulletFeedback(...items: string[]): string {
  const lines: string[] = [];
  for (const item of items) {
    if (!item?.trim()) continue;
    for (const raw of item.split(/\n+/)) {
      const line = sanitizeCoachFeedback(raw);
      if (!line) continue;
      // Split long prose into sentence bullets when needed.
      const sentences = line.includes(". ")
        ? line.split(/(?<=\.)\s+/).map((s) => s.trim()).filter(Boolean)
        : [line];
      for (const s of sentences) {
        if (!lines.includes(s)) lines.push(s);
      }
    }
  }
  return lines
    .slice(0, 6)
    .map((l) => `• ${l}`)
    .join("\n");
}

/** Force any coach string into concise bullet form. */
export function ensureBulletFeedback(text: string): string {
  return toBulletFeedback(text);
}

export function trendSentence(trend: ScalePracticeTrend): string {
  switch (trend) {
    case "sharp":
      return toBulletFeedback("Trending a bit sharp", "Relax into the pitch");
    case "flat":
      return toBulletFeedback("Trending a bit flat", "Aim slightly higher");
    default:
      return toBulletFeedback("Pitch bias looks centred");
  }
}

export function noteRowHint(row: ScalePracticeNoteRow): string {
  if (row.missingData) {
    return sanitizeCoachFeedback(
      "Unclear tone. More bow hair, one slow bow.",
    );
  }
  switch (row.intonationBucket) {
    case "in_tune":
      return "On pitch.";
    case "sharp":
      return "A bit high. Soften the thumb.";
    case "flat":
      return "A bit low. Place a touch higher.";
    default:
      return "";
  }
}

export function weakestIntro(): string {
  return "Focus notes";
}

export type ScaleCoachingFocusNote = {
  noteIndex: number;
  label: string;
  bucket: ScalePracticeNoteRow["intonationBucket"];
  centsLabel: string;
  hint: string;
};

export type ScaleCoachingFeedback = {
  headline: string;
  /** One short practice tip (staff already shows which notes). */
  tip: string;
  trendLine: string;
  /** Kept for tests / future AI — not shown as a long UI list. */
  focusNotes: ScaleCoachingFocusNote[];
  strengths: string[];
  practicePlan: string[];
  overview: string;
};

function formatSignedCents(cents: number): string {
  const rounded = Math.round(cents);
  if (rounded > 0) return `+${rounded}¢`;
  if (rounded < 0) return `${rounded}¢`;
  return "0¢";
}

function headlineFor(summary: ScalePracticeSummary): string {
  if (summary.notesAnalyzed === 0) return "Couldn’t hear clear pitches.";
  if (summary.inTunePercent >= 90) return "Excellent intonation.";
  if (summary.inTunePercent >= 75) return "Strong control.";
  if (summary.inTunePercent >= 55) return "Getting there.";
  return "Needs more tuning work.";
}

function tipFor(
  focusNotes: ScaleCoachingFocusNote[],
  summary: ScalePracticeSummary,
): string {
  if (summary.notesAnalyzed === 0) {
    return toBulletFeedback(
      "Re-record slowly",
      "Full bow hair on each note",
    );
  }
  if (summary.averageAbsCents >= 150) {
    return toBulletFeedback(
      "Check tonic and octave match the recording",
      "Then try again",
    );
  }
  if (focusNotes.length === 0) {
    return toBulletFeedback(
      "Nice take",
      "Keep the same slow, even pulse",
    );
  }
  const labels = focusNotes
    .slice(0, 2)
    .map((n) => n.label)
    .join(" & ");
  if (summary.trend === "sharp") {
    return toBulletFeedback(
      `Work ${labels}`,
      "Lighten the finger",
      "Settle before moving",
    );
  }
  if (summary.trend === "flat") {
    return toBulletFeedback(
      `Work ${labels}`,
      "Place a touch higher",
      "Keep bow speed steady",
    );
  }
  return toBulletFeedback(
    `Isolate ${labels}`,
    "A few slow bows each",
    "Then replay the scale",
  );
}

function collectFocusNotes(
  notes: ScalePracticeNoteRow[],
  summary: ScalePracticeSummary,
): ScaleCoachingFocusNote[] {
  const fromWeakest = summary.weakestNoteIndices
    .map((idx) => notes[idx])
    .filter((row): row is ScalePracticeNoteRow => Boolean(row))
    .filter((row) => row.missingData || row.intonationBucket !== "in_tune")
    .slice(0, 3);

  const source =
    fromWeakest.length > 0
      ? fromWeakest
      : [...notes]
          .filter((n) => n.missingData || n.intonationBucket !== "in_tune")
          .sort(
            (a, b) =>
              Math.abs(b.centsDifference) - Math.abs(a.centsDifference),
          )
          .slice(0, 3);

  return source.map((row) => ({
    noteIndex: row.noteIndex,
    label: row.expectedNoteLabel,
    bucket: row.intonationBucket,
    centsLabel: row.missingData ? "—" : formatSignedCents(row.centsDifference),
    hint: noteRowHint(row),
  }));
}

function collectStrengths(
  notes: ScalePracticeNoteRow[],
  summary: ScalePracticeSummary,
): string[] {
  const out: string[] = [];
  const inTune = notes.filter((n) => !n.missingData && n.intonationBucket === "in_tune");
  if (inTune.length >= Math.max(3, Math.floor(notes.length * 0.45))) {
    out.push("Several notes landed close to pitch");
  }
  if (summary.trend === "balanced" && summary.notesAnalyzed > 0) {
    out.push("Pitch stayed fairly even through the scale");
  }
  if (summary.inTunePercent >= 75) {
    out.push("Solid overall control on this take");
  } else if (summary.notesAnalyzed > 0 && summary.averageAbsCents < 40) {
    out.push("Tone was clear enough to measure well");
  }
  if (out.length === 0 && summary.notesAnalyzed > 0) {
    out.push("You completed a full take — good place to build from");
  }
  return out.slice(0, 3).map((s) => sanitizeCoachFeedback(s));
}

/**
 * Short template coaching — staff colours carry the per-note detail.
 */
export function buildScaleCoachingFeedback(
  session: Pick<
    ScalePracticeSessionV1,
    "notes" | "summary" | "scaleLabel"
  >,
): ScaleCoachingFeedback {
  const { notes, summary } = session;
  const focusNotes = collectFocusNotes(notes, summary);
  const tip = tipFor(focusNotes, summary);
  const trendLine = trendSentence(summary.trend);
  const strengths = collectStrengths(notes, summary);

  const cleanTip = ensureBulletFeedback(tip);
  const cleanTrend = ensureBulletFeedback(trendLine);

  return {
    headline: sanitizeCoachFeedback(headlineFor(summary)),
    tip: cleanTip,
    trendLine: cleanTrend,
    focusNotes,
    strengths,
    practicePlan: cleanTip.split("\n"),
    overview: cleanTip,
  };
}

/** @deprecated Prefer tip; kept so older imports don’t break. */
export function overviewBandCopy(summary: ScalePracticeSummary): string {
  return `${Math.round(summary.inTunePercent)}% within ±${SCALE_IN_TUNE_CENTS}¢`;
}
