import type {
  ScalePracticeNoteRow,
  ScalePracticeSessionV1,
  ScalePracticeSummary,
  ScalePracticeTrend,
} from "@/lib/scalePracticeTypes";
import { SCALE_IN_TUNE_CENTS } from "@/lib/analyzeScalePerformance";
import { violinStringFingerLabel } from "@/lib/violinScaleReference";

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

/** Always format coach copy as short • bullet lines (no dashes, no end full stops). */
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
        const cleaned = s.replace(/\.+$/u, "").trim();
        if (cleaned && !lines.includes(cleaned)) lines.push(cleaned);
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

/** Keep only the first N bullet lines (opening coach message should stay short). */
export function takeCoachBullets(text: string, max: number): string {
  return ensureBulletFeedback(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, Math.max(1, max))
    .join("\n");
}

export function trendSentence(trend: ScalePracticeTrend): string {
  switch (trend) {
    case "sharp":
      return toBulletFeedback("A bit high overall");
    case "flat":
      return toBulletFeedback("A bit low overall");
    default:
      return toBulletFeedback("Most notes were about right");
  }
}

/** True when the take needs praise, not finger/tape drills. */
export function isCleanTake(
  summary: Pick<ScalePracticeSummary, "inTunePercent" | "notesAnalyzed">,
  focusNoteCount: number,
): boolean {
  return (
    summary.notesAnalyzed > 0 &&
    summary.inTunePercent >= 90 &&
    focusNoteCount === 0
  );
}

function celebrateOpener(): string {
  return toBulletFeedback("Every note was right on");
}

function stringLetterForMidi(midi: number): string {
  return violinStringFingerLabel(midi).charAt(0);
}

/** One string where every note was off, while some other notes were OK. */
function fullyOffStringLetter(notes: ScalePracticeNoteRow[]): string | null {
  const groups = new Map<string, { total: number; off: number }>();
  for (const note of notes) {
    const letter = stringLetterForMidi(note.expectedMidi);
    const group = groups.get(letter) ?? { total: 0, off: 0 };
    group.total += 1;
    if (note.missingData || note.intonationBucket !== "in_tune") {
      group.off += 1;
    }
    groups.set(letter, group);
  }
  const fullyOff = [...groups.entries()].filter(
    ([, group]) => group.total >= 2 && group.off === group.total,
  );
  const hasInTune = notes.some(
    (note) => !note.missingData && note.intonationBucket === "in_tune",
  );
  if (fullyOff.length === 1 && hasInTune) return fullyOff[0]![0];
  return null;
}

function isOverallOffTake(
  summary: Pick<
    ScalePracticeSummary,
    "notesAnalyzed" | "averageAbsCents" | "inTunePercent"
  >,
): boolean {
  if (summary.notesAnalyzed === 0) return false;
  if (summary.averageAbsCents >= 150) return true;
  return summary.inTunePercent < 25 && summary.notesAnalyzed >= 3;
}

export function noteRowHint(row: ScalePracticeNoteRow): string {
  if (row.missingData) {
    return sanitizeCoachFeedback("Hard to hear. Try a slow bow.");
  }
  switch (row.intonationBucket) {
    case "in_tune":
      return "About right.";
    case "sharp":
      return "A bit high. Try the tape.";
    case "flat":
      return "A bit low. Try a little higher.";
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
  if (summary.notesAnalyzed === 0) return "Hard to hear clear pitches this take.";
  if (summary.inTunePercent >= 90) return "Excellent intonation.";
  if (summary.inTunePercent >= 75) return "Strong control.";
  if (summary.inTunePercent >= 55) return "Getting steadier.";
  if (summary.inTunePercent >= 30) return "Building — keep going.";
  return "Getting started — slow bows help.";
}

function workOnLine(focusNotes: ScaleCoachingFocusNote[]): string {
  const unique = [...new Set(focusNotes.slice(0, 3).map((n) => n.label))].slice(
    0,
    2,
  );
  const labels = unique.join(" and ");
  const verb = unique.length > 1 ? "were" : "was";
  const picked = unique.map(
    (label) => focusNotes.find((n) => n.label === label)!,
  );
  const allMissing = picked.every(
    (n) => n.centsLabel === "—" || n.bucket === "unknown",
  );
  const allSharp = picked.every((n) => n.bucket === "sharp");
  const allFlat = picked.every((n) => n.bucket === "flat");
  if (allMissing) return `${labels} ${verb} hard to hear`;
  if (allSharp) return `${labels} ${verb} a bit high`;
  if (allFlat) return `${labels} ${verb} a bit low`;
  return `${labels} ${verb} a bit off`;
}

function tipFor(
  notes: ScalePracticeNoteRow[],
  focusNotes: ScaleCoachingFocusNote[],
  summary: ScalePracticeSummary,
): string {
  if (summary.notesAnalyzed === 0) {
    return toBulletFeedback(
      "Hard to hear a full scale. Play every note slowly, then try again",
    );
  }
  if (isOverallOffTake(summary)) {
    return toBulletFeedback(
      "This take was off. Start on the right note, then try again",
    );
  }
  const offString = fullyOffStringLetter(notes);
  if (offString) {
    return toBulletFeedback(
      `Every note on ${offString} was off. Check that string`,
    );
  }
  if (isCleanTake(summary, focusNotes.length)) {
    return celebrateOpener();
  }
  if (focusNotes.length === 0) {
    return toBulletFeedback("Most notes were about right");
  }
  return toBulletFeedback(workOnLine(focusNotes));
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
    label: violinStringFingerLabel(row.expectedMidi),
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
    out.push("Lots of notes were in the right place");
  }
  if (summary.inTunePercent >= 90) {
    out.unshift("You played really well");
  } else if (summary.trend === "balanced" && summary.notesAnalyzed > 0) {
    out.push("The scale stayed pretty even");
  }
  if (summary.inTunePercent >= 75 && summary.inTunePercent < 90) {
    out.push("This take sounded steady");
  } else if (
    summary.inTunePercent < 75 &&
    summary.notesAnalyzed > 0 &&
    summary.averageAbsCents < 40
  ) {
    out.push("We could hear the notes clearly");
  }
  if (
    out.length === 0 &&
    summary.notesAnalyzed > 0 &&
    summary.notesMissing === 0
  ) {
    out.push("You finished the whole take");
  }
  return out.slice(0, 3).map((s) => sanitizeCoachFeedback(s));
}

/**
 * Short template coaching — staff colours carry the per-note detail.
 * Auto opener lives in `tip` (1 bullet, or 2 for a major pattern).
 * `trendLine` stays empty so the coach does not lecture twice.
 */
export function buildScaleCoachingFeedback(
  session: Pick<
    ScalePracticeSessionV1,
    "notes" | "summary" | "scaleLabel"
  >,
): ScaleCoachingFeedback {
  const { notes, summary } = session;
  const focusNotes = collectFocusNotes(notes, summary);
  const strengths = collectStrengths(notes, summary);
  const tip = takeCoachBullets(tipFor(notes, focusNotes, summary), 2);

  return {
    headline: sanitizeCoachFeedback(headlineFor(summary)),
    tip,
    trendLine: "",
    focusNotes,
    strengths,
    practicePlan: tip.split("\n"),
    overview: tip,
  };
}

/** @deprecated Prefer tip; kept so older imports don’t break. */
export function overviewBandCopy(summary: ScalePracticeSummary): string {
  return `${Math.round(summary.inTunePercent)}% within ±${SCALE_IN_TUNE_CENTS}¢`;
}
