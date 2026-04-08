/**
 * Structured scale-practice session payload for UI, analytics, and future AI teacher.
 * Versioned so an LLM or backend can rely on a stable JSON shape.
 */
export const SCALE_PRACTICE_SESSION_VERSION = 1 as const;

export type ScalePracticeExerciseType = "scale_practice";

export type ScalePracticeAudioSource = "recorded" | "uploaded";

/** Coarse intonation bucket per note (AI-friendly categories). */
export type ScalePracticeIntonationBucket =
  | "in_tune"
  | "sharp"
  | "flat"
  | "unknown";

/** Overall pitch bias across the exercise (summary for AI). */
export type ScalePracticeTrend = "sharp" | "flat" | "balanced";

export type ScalePracticeNoteRow = {
  /** 0-based position in the ascending scale */
  noteIndex: number;
  expectedMidi: number;
  expectedNoteLabel: string;
  /** Rounded MIDI from detected pitch */
  detectedMidi: number;
  /** Same as formatNoteLabel(detectedMidi) — explicit for JSON / AI */
  detectedNoteLabel: string;
  detectedHz: number;
  /** Signed: positive = sharp vs expected */
  centsDifference: number;
  intonationBucket: ScalePracticeIntonationBucket;
  /** Window had no confident pitch samples */
  missingData: boolean;
};

export type ScalePracticeSummary = {
  overallScore0to100: number;
  averageAbsCents: number;
  inTunePercent: number;
  /** Indices with largest |cents|, worst first (max 8 entries) */
  weakestNoteIndices: number[];
  trend: ScalePracticeTrend;
  meanSignedCents: number;
  notesAnalyzed: number;
  notesMissing: number;
};

export type ScalePracticeSessionV1 = {
  schemaVersion: typeof SCALE_PRACTICE_SESSION_VERSION;
  sessionId: string;
  exerciseType: ScalePracticeExerciseType;
  /** ISO 8601 */
  recordedAt: string;
  scaleId: string;
  scaleLabel: string;
  scaleKind: "major" | "natural_minor";
  tonicPitchClass: number;
  octaveSpan: 1 | 2;
  octaveRangeLabel: string;
  rootMidi: number;
  expectedNotesMidi: number[];
  audioSourceType: ScalePracticeAudioSource;
  sampleRateHz: number;
  notes: ScalePracticeNoteRow[];
  summary: ScalePracticeSummary;
};
