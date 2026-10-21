import { formatNoteLabel } from "@/lib/intonation";
import type { ScaleKind } from "@/lib/scales";
import {
  buildAscendingScaleMidis,
  buildExerciseScaleMidis,
  octaveRangeLabel,
  scaleDisplayLabel,
} from "@/lib/scales";

export function scaleRecordingTips(includesDescent: boolean): string[] {
  return [
    includesDescent
      ? "Play a clear scale up, then back down"
      : "Play a clear scale going up",
    "Stay close to the mic in a quiet room",
    "One note after another, no talking over it",
  ];
}

export type ScalePracticeGuideModel = {
  scaleLabel: string;
  rangeLabel: string;
  ascendingLabels: string[];
  descendingLabels: string[];
  ascendingCount: number;
  totalSteps: number;
  theoryLine: string;
  howToPractice: string[];
  recordingTips: string[];
};

export function buildScalePracticeGuideModel(
  tonicPitchClass: number,
  scaleKind: ScaleKind,
  rootMidi: number,
  octaveSpan: 1 | 2,
): ScalePracticeGuideModel {
  const up = buildAscendingScaleMidis(rootMidi, scaleKind, octaveSpan);
  const full = buildExerciseScaleMidis(rootMidi, scaleKind, octaveSpan);
  const down = full.slice(up.length);

  const scaleLabel = scaleDisplayLabel(tonicPitchClass, scaleKind);
  const rangeLabel = octaveRangeLabel(up[0]!, up[up.length - 1]!);

  const theoryLine =
    scaleKind === "major"
      ? "Major scales use the pattern whole–whole–half–whole–whole–whole–half between steps. They tend to sound bright and settled on the tonic."
      : "Natural minor lowers the 3rd, 6th, and 7th compared to major. The colour is often described as more sombre or introspective.";

  const howToPractice = [
    "Use one bow stroke per note at first, or slur two notes once the pattern feels easy.",
    "Keep each note ringing before you move the finger — aim for a clean lift, not a squeeze.",
    "Listen for the half steps (narrow gaps between fingers) versus whole steps (wider gaps).",
    "Stay in a consistent contact point between bridge and fingerboard unless your teacher suggests otherwise.",
  ];

  const recordingTips = scaleRecordingTips(true);

  return {
    scaleLabel,
    rangeLabel,
    ascendingLabels: up.map((m) => formatNoteLabel(m)),
    descendingLabels: down.map((m) => formatNoteLabel(m)),
    ascendingCount: up.length,
    totalSteps: full.length,
    theoryLine,
    howToPractice,
    recordingTips,
  };
}
