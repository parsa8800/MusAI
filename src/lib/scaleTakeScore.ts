import {
  NOTE_ACCURACY_FULL_CENTS,
  NOTE_ACCURACY_ZERO_CENTS,
  SCORE_CLEAR_MISS_CENTS,
  SCORE_IN_TUNE_CENTS,
  SCALE_EXCELLENT_IN_TUNE_PERCENT,
  SCALE_EXCELLENT_MIN,
  SCALE_EXCELLENT_OVERALL,
  SCALE_SCORE_CAPS,
  SCALE_SCORE_WEIGHTS,
  SCORE_CAP_BLEND,
  STEADINESS_CV_TO_ZERO,
  STEADINESS_MIN_NOTES,
  STEADINESS_SPARSE_SCORE,
  TONE_CLARITY_BLEND,
  TONE_CLARITY_FLOOR,
  TONE_STABILITY_BLEND,
  TONE_STABILITY_CENTS_ZERO,
  UNKNOWN_STEADINESS_SCORE,
  UNKNOWN_TONE_SCORE,
} from "@/lib/scaleScoringConfig";
import type {
  ScalePracticeNoteRow,
  ScalePracticeSummary,
} from "@/lib/scalePracticeTypes";

export type ScaleScoreCategories = {
  noteAccuracy: number;
  intonation: number;
  completeness: number;
  steadiness: number;
  toneClarity: number;
};

export type ScaleTakeScore = {
  categories: ScaleScoreCategories;
  /** Weighted mix before safety caps. */
  rawScore: number;
  /** Final 0–100 take quality (what the progress bar stores). */
  score: number;
  /** True when a safety cap lowered the weighted mix. */
  capped: boolean;
  excellent: boolean;
  completionScore: number;
  performanceScore: number;
};

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

function coeffVar(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  if (m <= 1e-9) return 0;
  return stdev(xs) / m;
}

function cvToScore(cv: number): number {
  return clampScore(100 - (Math.max(0, cv) / STEADINESS_CV_TO_ZERO) * 100);
}

/** 1 = written pitch, 0 = missing or the wrong note. */
export function noteAccuracyCredit(note: ScalePracticeNoteRow): number {
  if (note.missingData) return 0;
  const abs = Math.abs(note.centsDifference);
  if (abs <= NOTE_ACCURACY_FULL_CENTS) return 1;
  if (abs >= NOTE_ACCURACY_ZERO_CENTS) return 0;
  const t =
    (abs - NOTE_ACCURACY_FULL_CENTS) /
    (NOTE_ACCURACY_ZERO_CENTS - NOTE_ACCURACY_FULL_CENTS);
  return clampScore(100 * (1 - t) * 0.85) / 100;
}

/** Stricter than note-colour scoring so 40¢ errors cannot look excellent. */
export function intonationCategoryPoints(absCents: number): number {
  const a = Math.abs(absCents);
  if (a <= SCORE_IN_TUNE_CENTS) {
    return Math.round(100 - (a / SCORE_IN_TUNE_CENTS) * 10);
  }
  if (a <= SCORE_CLEAR_MISS_CENTS) {
    const t =
      (a - SCORE_IN_TUNE_CENTS) /
      (SCORE_CLEAR_MISS_CENTS - SCORE_IN_TUNE_CENTS);
    return Math.round(90 - t * 30);
  }
  return Math.max(0, Math.min(60, Math.round(60 - (a - SCORE_CLEAR_MISS_CENTS) * 1.4)));
}

export function noteAccuracyScore(notes: readonly ScalePracticeNoteRow[]): number {
  if (notes.length === 0) return 0;
  return clampScore(
    (100 * notes.reduce((s, n) => s + noteAccuracyCredit(n), 0)) / notes.length,
  );
}

/**
 * How close played notes were to pitch. Missing slots are 0 so a short
 * in-tune fragment cannot report perfect intonation.
 */
export function intonationScore(notes: readonly ScalePracticeNoteRow[]): number {
  if (notes.length === 0) return 0;
  const played = notes.filter((n) => !n.missingData);
  if (played.length === 0) return 0;
  const playedMean =
    played.reduce(
      (s, n) => s + intonationCategoryPoints(Math.abs(n.centsDifference)),
      0,
    ) / played.length;
  // Completeness already has its own pillar; still mix in a missing
  // penalty so intonation cannot stay “perfect” on a half-scale.
  const coverage = played.length / notes.length;
  return clampScore(playedMean * (0.55 + 0.45 * coverage));
}

export function completenessScore(notes: readonly ScalePracticeNoteRow[]): number {
  if (notes.length === 0) return 0;
  const played = notes.filter((n) => !n.missingData).length;
  return clampScore((100 * played) / notes.length);
}

function noteDurations(notes: readonly ScalePracticeNoteRow[]): number[] {
  return notes
    .filter((n) => !n.missingData && typeof n.durationSec === "number" && n.durationSec > 0)
    .map((n) => n.durationSec!);
}

function interOnsets(notes: readonly ScalePracticeNoteRow[]): number[] {
  const played = notes.filter(
    (n) =>
      !n.missingData &&
      typeof n.onsetSec === "number" &&
      Number.isFinite(n.onsetSec),
  );
  const iois: number[] = [];
  for (let i = 1; i < played.length; i++) {
    const dt = played[i]!.onsetSec! - played[i - 1]!.onsetSec!;
    if (dt > 0.04 && dt < 4) iois.push(dt);
  }
  return iois;
}

export function steadinessScore(
  notes: readonly ScalePracticeNoteRow[],
  completeness: number,
): number {
  const durs = noteDurations(notes);
  if (durs.length < STEADINESS_MIN_NOTES) {
    return clampScore(STEADINESS_SPARSE_SCORE * (completeness / 100));
  }
  const durationPart = cvToScore(coeffVar(durs));
  const iois = interOnsets(notes);
  const ioiPart = iois.length >= 2 ? cvToScore(coeffVar(iois)) : durationPart;
  return clampScore(0.55 * durationPart + 0.45 * ioiPart);
}

function toneForNote(note: ScalePracticeNoteRow): number | null {
  const hasClarity =
    typeof note.meanClarity === "number" && Number.isFinite(note.meanClarity);
  const hasStab =
    typeof note.pitchStabilityCents === "number" &&
    Number.isFinite(note.pitchStabilityCents);
  if (!hasClarity && !hasStab) return null;

  const clarity = hasClarity
    ? clampScore(
        ((note.meanClarity! - TONE_CLARITY_FLOOR) / (1 - TONE_CLARITY_FLOOR)) *
          50 +
          50,
      )
    : UNKNOWN_TONE_SCORE;
  const stab = hasStab
    ? clampScore(
        100 - (Math.max(0, note.pitchStabilityCents!) / TONE_STABILITY_CENTS_ZERO) * 100,
      )
    : UNKNOWN_TONE_SCORE;
  return TONE_CLARITY_BLEND * clarity + TONE_STABILITY_BLEND * stab;
}

export function toneClarityScore(notes: readonly ScalePracticeNoteRow[]): number {
  const played = notes.filter((n) => !n.missingData);
  if (played.length === 0) return 0;
  const samples = played.map(toneForNote);
  if (samples.every((s) => s == null)) return UNKNOWN_TONE_SCORE;
  const known = samples.filter((s): s is number => s != null);
  return clampScore(mean(known));
}

export function takeLooksFullyCorrect(
  notes: readonly ScalePracticeNoteRow[],
  summary: Pick<
    ScalePracticeSummary,
    "notesAnalyzed" | "notesMissing" | "inTunePercent" | "overallScore0to100"
  >,
): boolean {
  const expected = Math.max(1, notes.length);
  if (summary.notesAnalyzed <= 0) return false;
  if (summary.notesMissing > 0) return false;
  if (summary.notesAnalyzed < expected) return false;
  if (summary.inTunePercent < SCALE_EXCELLENT_IN_TUNE_PERCENT) return false;
  if (summary.overallScore0to100 < SCALE_EXCELLENT_OVERALL) return false;
  return notes.every((n) => !n.missingData && n.intonationBucket === "in_tune");
}

/**
 * Cap that is fully on at/below a threshold, then eases off so one extra
 * detected note cannot drop the score off a cliff.
 */
function capWhenBelow(
  value: number,
  threshold: number,
  hardCap: number,
  opts?: { inclusive?: boolean; blend?: number },
): number {
  const blend = opts?.blend ?? SCORE_CAP_BLEND;
  const hit = opts?.inclusive ? value <= threshold : value < threshold;
  if (hit) return hardCap;
  if (value >= threshold + blend) return 100;
  const t = (value - threshold) / blend;
  return hardCap + (100 - hardCap) * t;
}

function capWhenAbove(
  value: number,
  threshold: number,
  hardCap: number,
  opts?: { inclusive?: boolean; blend?: number },
): number {
  const blend = opts?.blend ?? SCORE_CAP_BLEND;
  const hit = opts?.inclusive === false ? value > threshold : value >= threshold;
  if (hit) return hardCap;
  if (value <= threshold - blend) return 100;
  const t = (threshold - value) / blend;
  return hardCap + (100 - hardCap) * t;
}

function applySafetyCaps(
  raw: number,
  categories: ScaleScoreCategories,
  notes: readonly ScalePracticeNoteRow[],
): { score: number; capped: boolean } {
  const expected = Math.max(1, notes.length);
  const missed = notes.filter((n) => n.missingData).length;
  const wrong = notes.filter(
    (n) => !n.missingData && noteAccuracyCredit(n) < 0.5,
  ).length;
  const completenessFrac = categories.completeness / 100;
  const accuracyFrac = categories.noteAccuracy / 100;
  const wrongOrMissedFrac = (missed + wrong) / expected;
  const inTuneFrac =
    notes.filter((n) => !n.missingData && n.intonationBucket === "in_tune")
      .length / expected;
  const caps = SCALE_SCORE_CAPS;

  let cap = 100;
  if (completenessFrac < caps.fragmentFrac) {
    cap = Math.min(cap, caps.fragmentCap);
  } else {
    cap = Math.min(
      cap,
      capWhenBelow(completenessFrac, caps.halfScaleFrac, caps.halfScaleCap, {
        inclusive: true,
      }),
    );
  }
  cap = Math.min(
    cap,
    capWhenAbove(wrongOrMissedFrac, caps.wrongOrMissedFrac, caps.wrongOrMissedCap),
  );
  cap = Math.min(
    cap,
    capWhenBelow(accuracyFrac, caps.mostlyWrongAccuracyFrac, caps.mostlyWrongCap),
  );
  cap = Math.min(
    cap,
    capWhenBelow(accuracyFrac, caps.lowAccuracyFrac, caps.lowAccuracyCap),
  );
  if (completenessFrac < 1) {
    cap = Math.min(cap, caps.incompleteCap);
  }
  cap = Math.min(
    cap,
    capWhenBelow(inTuneFrac, caps.veryLowInTuneFrac, caps.veryLowInTuneCap),
  );
  cap = Math.min(
    cap,
    capWhenBelow(inTuneFrac, caps.lowInTuneFrac, caps.lowInTuneCap),
  );

  const score = Math.min(raw, cap);
  return { score, capped: score + 0.05 < raw };
}

export function scoreScaleTake(
  notes: readonly ScalePracticeNoteRow[],
  summary?: Pick<
    ScalePracticeSummary,
    "notesAnalyzed" | "notesMissing" | "inTunePercent" | "overallScore0to100"
  >,
): ScaleTakeScore {
  const heard = notes.some((n) => !n.missingData);
  if (!heard) {
    const empty: ScaleScoreCategories = {
      noteAccuracy: 0,
      intonation: 0,
      completeness: 0,
      steadiness: 0,
      toneClarity: 0,
    };
    return {
      categories: empty,
      rawScore: 0,
      score: 0,
      capped: false,
      excellent: false,
      completionScore: 0,
      performanceScore: 0,
    };
  }
  const completeness = completenessScore(notes);
  const hasTiming = notes.some(
    (n) => !n.missingData && typeof n.durationSec === "number",
  );
  const categories: ScaleScoreCategories = {
    noteAccuracy: round1(noteAccuracyScore(notes)),
    intonation: round1(intonationScore(notes)),
    completeness: round1(completeness),
    steadiness: round1(
      hasTiming
        ? steadinessScore(notes, completeness)
        : UNKNOWN_STEADINESS_SCORE,
    ),
    toneClarity: round1(toneClarityScore(notes)),
  };

  const w = SCALE_SCORE_WEIGHTS;
  const raw = clampScore(
    w.noteAccuracy * categories.noteAccuracy +
      w.intonation * categories.intonation +
      w.completeness * categories.completeness +
      w.steadiness * categories.steadiness +
      w.toneClarity * categories.toneClarity,
  );

  const fullyCorrect = summary
    ? takeLooksFullyCorrect(notes, summary)
    : notes.length > 0 &&
      notes.every((n) => !n.missingData && n.intonationBucket === "in_tune");
  const canJudgeTiming = hasTiming;
  const canJudgeTone = notes.some(
    (n) =>
      !n.missingData &&
      (typeof n.meanClarity === "number" ||
        typeof n.pitchStabilityCents === "number"),
  );
  const pillarsExcellent =
    categories.noteAccuracy >= SCALE_EXCELLENT_MIN.noteAccuracy &&
    categories.intonation >= SCALE_EXCELLENT_MIN.intonation &&
    categories.completeness >= SCALE_EXCELLENT_MIN.completeness &&
    (!canJudgeTiming || categories.steadiness >= SCALE_EXCELLENT_MIN.steadiness) &&
    (!canJudgeTone || categories.toneClarity >= SCALE_EXCELLENT_MIN.toneClarity);
  const excellent = fullyCorrect && pillarsExcellent;

  let score: number;
  let capped = false;
  if (excellent) {
    score = 100;
  } else {
    const applied = applySafetyCaps(raw, categories, notes);
    score = applied.score;
    capped = applied.capped;
    // A strong-but-not-excellent take must stay below 100.
    if (score >= 100) score = 99;
  }

  return {
    categories,
    rawScore: round1(raw),
    score: round1(score),
    capped,
    excellent,
    completionScore: categories.completeness,
    performanceScore: categories.intonation,
  };
}
