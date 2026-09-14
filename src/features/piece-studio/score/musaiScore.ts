/**
 * Normalised MusAI score — source of truth for playback, tracking, and feedback.
 * Independent of OpenSheetMusicDisplay / VexFlow.
 */
export const MUSAI_SCORE_SCHEMA_VERSION = 1 as const;

export type ScoreClef = "treble" | "bass" | "alto" | "tenor" | "percussion" | "unknown";

export type ScoreNoteType =
  | "whole"
  | "half"
  | "quarter"
  | "eighth"
  | "16th"
  | "32nd"
  | "64th"
  | "breve"
  | "unknown";

export type ScoreAccidental =
  | "sharp"
  | "flat"
  | "natural"
  | "double-sharp"
  | "double-flat"
  | null;

export type ScorePitch = {
  step: "C" | "D" | "E" | "F" | "G" | "A" | "B";
  /** Chromatic alteration of the step (−2…2). */
  alter: number;
  octave: number;
  midi: number;
};

export type ScoreArticulation =
  | "staccato"
  | "staccatissimo"
  | "accent"
  | "strong-accent"
  | "tenuto"
  | "marcato"
  | "fermata";

export type ScoreNote = {
  kind: "note";
  onsetQuarters: number;
  durationQuarters: number;
  pitch: ScorePitch;
  type: ScoreNoteType;
  dots: number;
  accidental: ScoreAccidental;
  chord: boolean;
  tied: boolean;
  /** Practical articulations preserved from MusicXML when present. */
  articulations: ScoreArticulation[];
  staff: number;
  voice: number;
};

export type ScoreRest = {
  kind: "rest";
  onsetQuarters: number;
  durationQuarters: number;
  type: ScoreNoteType;
  dots: number;
  staff: number;
  voice: number;
};

export type ScoreDynamic = {
  kind: "dynamic";
  onsetQuarters: number;
  mark: string;
};

export type ScoreEvent = ScoreNote | ScoreRest | ScoreDynamic;

export type ScoreKey = {
  fifths: number;
  mode: "major" | "minor";
  label: string;
};

export type ScoreTime = {
  beats: number;
  beatType: number;
  label: string;
};

export type ScoreMeasure = {
  number: string;
  divisions: number;
  key: ScoreKey | null;
  time: ScoreTime | null;
  tempoBpm: number | null;
  clef: ScoreClef | null;
  events: ScoreEvent[];
};

export type ScorePart = {
  id: string;
  name: string | null;
  measures: ScoreMeasure[];
};

export type MusaiScoreV1 = {
  schemaVersion: typeof MUSAI_SCORE_SCHEMA_VERSION;
  title: string;
  composer: string | null;
  keySignature: string | null;
  timeSignature: string | null;
  tempoBpm: number | null;
  measureCount: number;
  noteCount: number;
  restCount: number;
  parts: ScorePart[];
};

export function emptyMusaiScore(title: string): MusaiScoreV1 {
  return {
    schemaVersion: MUSAI_SCORE_SCHEMA_VERSION,
    title,
    composer: null,
    keySignature: null,
    timeSignature: null,
    tempoBpm: null,
    measureCount: 0,
    noteCount: 0,
    restCount: 0,
    parts: [],
  };
}

export function summarizeMusaiScore(score: MusaiScoreV1): {
  noteCount: number;
  restCount: number;
  measureCount: number;
} {
  let noteCount = 0;
  let restCount = 0;
  let measureCount = 0;
  for (const part of score.parts) {
    measureCount = Math.max(measureCount, part.measures.length);
    for (const measure of part.measures) {
      for (const event of measure.events) {
        if (event.kind === "note") noteCount += 1;
        if (event.kind === "rest") restCount += 1;
      }
    }
  }
  return { noteCount, restCount, measureCount };
}
