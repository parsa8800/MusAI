import type { ScaleCandidate } from "@/lib/detectScale";
import { buildScalePracticeSession } from "@/lib/buildScalePracticeSession";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";
import { scaleIdFor } from "@/lib/scales";
import type { ScaleWorkspaceIdentity } from "@/lib/scaleWorkspace";
import { scaleWorkspaceHref } from "@/lib/scaleWorkspace";

/** Persist a detector hit as a practice session. */
export function sessionFromDetectedCandidate(
  candidate: ScaleCandidate,
  sampleRateHz: number,
  audioSourceType: "recorded" | "uploaded",
  waveformAmplitudes?: readonly number[],
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
