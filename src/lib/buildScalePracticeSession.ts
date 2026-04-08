import type { ScaleAnalysisResult } from "@/lib/analyzeScalePerformance";
import {
  buildAscendingScaleMidis,
  octaveRangeLabel,
  scaleDisplayLabel,
  scaleIdFor,
} from "@/lib/scales";
import type {
  ScalePracticeAudioSource,
  ScalePracticeSessionV1,
} from "@/lib/scalePracticeTypes";
import { SCALE_PRACTICE_SESSION_VERSION } from "@/lib/scalePracticeTypes";

export type BuildScaleSessionParams = {
  tonicPitchClass: number;
  scaleKind: "major" | "natural_minor";
  rootMidi: number;
  octaveSpan: 1 | 2;
  audioSourceType: ScalePracticeAudioSource;
  sampleRateHz: number;
  analysis: ScaleAnalysisResult;
};

export function buildScalePracticeSession(
  p: BuildScaleSessionParams,
): ScalePracticeSessionV1 {
  const expectedNotesMidi = buildAscendingScaleMidis(
    p.rootMidi,
    p.scaleKind,
    p.octaveSpan,
  );
  return {
    schemaVersion: SCALE_PRACTICE_SESSION_VERSION,
    sessionId:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `scale-${Date.now()}`,
    exerciseType: "scale_practice",
    recordedAt: new Date().toISOString(),
    scaleId: scaleIdFor(p.tonicPitchClass, p.scaleKind),
    scaleLabel: scaleDisplayLabel(p.tonicPitchClass, p.scaleKind),
    scaleKind: p.scaleKind,
    tonicPitchClass: p.tonicPitchClass,
    octaveSpan: p.octaveSpan,
    octaveRangeLabel: octaveRangeLabel(
      expectedNotesMidi[0]!,
      expectedNotesMidi[expectedNotesMidi.length - 1]!,
    ),
    rootMidi: p.rootMidi,
    expectedNotesMidi,
    audioSourceType: p.audioSourceType,
    sampleRateHz: p.sampleRateHz,
    notes: p.analysis.notes,
    summary: p.analysis.summary,
  };
}
