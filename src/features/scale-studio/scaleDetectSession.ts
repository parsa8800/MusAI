import type { ScaleAnalysisResult } from "@/lib/analyzeScalePerformance";
import type { ScaleCandidate } from "@/lib/detectScale";
import { buildScalePracticeSession } from "@/lib/buildScalePracticeSession";
import type { InstrumentId } from "@/lib/instrument";
import type {
  ScalePracticeAudioSource,
  ScalePracticeSessionV1,
} from "@/lib/scalePracticeTypes";
import { scaleIdFor } from "@/lib/scales";
import type { ScaleWorkspaceIdentity } from "@/lib/scaleWorkspace";
import { scaleWorkspaceHref } from "@/lib/scaleWorkspace";

/** Persist a detector hit as a practice session. */
export function sessionFromDetectedCandidate(
  candidate: ScaleCandidate,
  sampleRateHz: number,
  audioSourceType: "recorded" | "uploaded",
  waveformAmplitudes?: readonly number[],
  instrumentId?: InstrumentId,
): ScalePracticeSessionV1 {
  return buildScalePracticeSession({
    tonicPitchClass: candidate.tonicPitchClass,
    scaleKind: candidate.scaleKind,
    rootMidi: candidate.rootMidi,
    octaveSpan: candidate.octaveSpan,
    audioSourceType,
    sampleRateHz,
    analysis: candidate.analysis,
    expectedNotesMidi: candidate.expectedMidis,
    scaleSource: "detected",
    waveformAmplitudes,
    instrumentId,
  });
}

export function candidateMatchesIdentity(
  candidate: ScaleCandidate,
  identity: ScaleWorkspaceIdentity,
): boolean {
  return (
    scaleIdFor(candidate.tonicPitchClass, candidate.scaleKind) ===
      identity.scaleId && candidate.octaveSpan === identity.octaveSpan
  );
}

export function workspaceHrefForCandidate(candidate: ScaleCandidate): string {
  return scaleWorkspaceHref(
    scaleIdFor(candidate.tonicPitchClass, candidate.scaleKind),
    candidate.octaveSpan,
  );
}

export function candidateChipLabel(candidate: ScaleCandidate): string {
  const span = candidate.octaveSpan === 2 ? "2 oct" : "1 oct";
  return `${candidate.scaleLabel} · ${span}`;
}

/** Score this take as the locked practice scale (do not follow detection). */
export function sessionFromActiveIdentity(
  identity: Pick<
    ScaleWorkspaceIdentity,
    "tonicPitchClass" | "scaleKind" | "octaveSpan"
  >,
  input: {
    rootMidi: number;
    expectedMidis: readonly number[];
    analysis: ScaleAnalysisResult;
    sampleRateHz: number;
    audioSourceType: ScalePracticeAudioSource;
    waveformAmplitudes?: readonly number[];
    instrumentId?: InstrumentId;
  },
): ScalePracticeSessionV1 {
  return buildScalePracticeSession({
    tonicPitchClass: identity.tonicPitchClass,
    scaleKind: identity.scaleKind,
    rootMidi: input.rootMidi,
    octaveSpan: identity.octaveSpan,
    audioSourceType: input.audioSourceType,
    sampleRateHz: input.sampleRateHz,
    analysis: input.analysis,
    expectedNotesMidi: input.expectedMidis,
    scaleSource: "selected",
    waveformAmplitudes: input.waveformAmplitudes,
    instrumentId: input.instrumentId,
  });
}
