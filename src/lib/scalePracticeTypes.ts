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
  /** 0-based position in the expected scale (not “notes that were played”). */
  noteIndex: number;
  /** expectedScaleNotes[i] — what the player is supposed to play here */
  expectedMidi: number;
  expectedNoteLabel: string;
  /**
   * Rounded MIDI from detected pitch. 0 when `missingData` — never copy the
   * expected MIDI onto a note that was not actually heard.
   */
  detectedMidi: number;
  /** Same as formatNoteLabel(detectedMidi), or "—" when missing */
  detectedNoteLabel: string;
  detectedHz: number;
  /** Signed: positive = sharp vs expected. 0 when missing. */
  centsDifference: number;
  intonationBucket: ScalePracticeIntonationBucket;
  /**
   * True when this expectedScaleNote has no matched detectedNote.
   * Feedback is only valid when this is false.
   */
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
  /** How the expected scale was chosen. Older sessions omit this. */
  scaleSource?: "selected" | "detected";
  /**
   * Downsampled 0–1 amplitude history for this take (Voice Memos–style).
   * Optional — older sessions omit it.
   */
  waveformAmplitudes?: number[];
  /**
   * Scale mastery (0–100) after this take was folded into the loop.
   * Used when scrubbing take history so the progress bar can show
   * progress-at-that-point without recomputing from scratch.
   * Optional — older sessions omit it and fall back to recomputation.
   */
  masteryPercentAfterTake?: number;
};
