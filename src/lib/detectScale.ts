import { analyzeScaleFromFrames } from "@/lib/analyzeScalePerformance";
import {
  collectPitchFrames,
  collectStablePitchRuns,
  hzToMidi,
  type PitchFrame,
} from "@/lib/analyzePitch";
import { alignAnalysisToDetectedOctave } from "@/lib/alignScaleOctave";
import {
  buildAscendingScaleMidis,
  buildExerciseScaleMidis,
  scaleDisplayLabel,
  type ScaleKind,
  violinRootsForTonic,
} from "@/lib/scales";
import type { ScaleAnalysisResult } from "@/lib/analyzeScalePerformance";

export type ScalePattern = "round_trip" | "ascending";

export type ScaleCandidate = {
  tonicPitchClass: number;
  scaleKind: ScaleKind;
  rootMidi: number;
  octaveSpan: 1 | 2;
  pattern: ScalePattern;
  expectedMidis: number[];
  scaleLabel: string;
  analysis: ScaleAnalysisResult;
  rankScore: number;
};

export type DetectScaleResult =
  | {
      ok: true;
      best: ScaleCandidate;
      alternatives: ScaleCandidate[];
      ambiguous: boolean;
    }
  | { ok: false; reason: "no_pitch" | "no_match" };

function expectedMidisFor(
  rootMidi: number,
  kind: ScaleKind,
  span: 1 | 2,
  pattern: ScalePattern,
): number[] {
  return pattern === "round_trip"
    ? buildExerciseScaleMidis(rootMidi, kind, span)
    : buildAscendingScaleMidis(rootMidi, kind, span);
}

/** Prefer expected midis near the take’s absolute MIDI (scoring unwraps octaves). */
function octaveMismatchPenalty(
  analysis: ScaleAnalysisResult,
  expectedMidis: readonly number[],
): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < expectedMidis.length; i++) {
    const note = analysis.notes[i];
    if (!note || note.missingData) continue;
    sum += Math.abs(note.detectedMidi - expectedMidis[i]!);
    n++;
  }
  if (n === 0) return 50;
  return (sum / n) * 3.2;
}

function medianFrameMidi(frames: PitchFrame[]): number {
  const midis = frames.map((f) => hzToMidi(f.hz)).sort((a, b) => a - b);
  return midis[Math.floor(midis.length / 2)]!;
}

function rankScore(
  analysis: ScaleAnalysisResult,
  expectedMidis: readonly number[],
  runCount: number,
): number {
  const { summary } = analysis;
  if (summary.notesAnalyzed === 0) return Number.NEGATIVE_INFINITY;
  const expectedLen = expectedMidis.length;
  const cover = summary.notesAnalyzed / Math.max(1, expectedLen);
  const missingPenalty = summary.notesMissing * 14;
  const lengthHint =
    runCount > 0 ? Math.abs(expectedLen - runCount) * 1.8 : 0;
  return (
    summary.overallScore0to100 * cover -
    missingPenalty -
    lengthHint -
    octaveMismatchPenalty(analysis, expectedMidis)
  );
}

function sameScaleFamily(a: ScaleCandidate, b: ScaleCandidate): boolean {
  return (
    a.tonicPitchClass === b.tonicPitchClass &&
    a.scaleKind === b.scaleKind &&
    a.octaveSpan === b.octaveSpan &&
    a.pattern === b.pattern
  );
}

/**
 * Prefer a round-trip exercise when an ascending candidate only "wins" by
 * shrinking the expected scale to match an incomplete take (e.g. Halfway).
 */
function preferHonestExerciseCandidate(
  ranked: ScaleCandidate[],
): ScaleCandidate | undefined {
  const best = ranked[0];
  if (!best) return undefined;
  if (best.pattern !== "ascending") return best;

  const roundTrip = ranked.find(
    (c) =>
      c.pattern === "round_trip" &&
      c.tonicPitchClass === best.tonicPitchClass &&
      c.scaleKind === best.scaleKind &&
      c.octaveSpan === best.octaveSpan &&
      Math.abs(c.rootMidi - best.rootMidi) <= 1 &&
      c.analysis.summary.notesAnalyzed >= 4,
  );
  if (!roundTrip) return best;

  const ascAnalyzed = best.analysis.summary.notesAnalyzed;
  const rtAnalyzed = roundTrip.analysis.summary.notesAnalyzed;
  // Incomplete take: round-trip maps more of the audio onto the full exercise.
  if (rtAnalyzed >= ascAnalyzed) return roundTrip;
  // Ascending only barely beats round-trip → keep the full exercise.
  if (roundTrip.rankScore > best.rankScore - 45) return roundTrip;
  return best;
}

export function detectScaleFromFrames(
  frames: PitchFrame[],
): DetectScaleResult {
  if (frames.length < 4) return { ok: false, reason: "no_pitch" };

  const runs = collectStablePitchRuns(frames);
  const anchorMidi = medianFrameMidi(frames);
  const kinds: ScaleKind[] = ["major", "natural_minor"];
  const spans: Array<1 | 2> = [1, 2];
  const patterns: ScalePattern[] = ["round_trip", "ascending"];

  const ranked: ScaleCandidate[] = [];

  for (const scaleKind of kinds) {
    for (const octaveSpan of spans) {
      for (const pattern of patterns) {
        for (let tonicPitchClass = 0; tonicPitchClass < 12; tonicPitchClass++) {
          const allRoots = violinRootsForTonic(tonicPitchClass);
          const near = allRoots
            .filter((r) => Math.abs(r - anchorMidi) <= 18)
            .sort(
              (a, b) => Math.abs(a - anchorMidi) - Math.abs(b - anchorMidi),
            );
          const rootList =
            near.length > 0
              ? near.slice(0, 3)
              : [...allRoots]
                  .sort(
                    (a, b) =>
                      Math.abs(a - anchorMidi) - Math.abs(b - anchorMidi),
                  )
                  .slice(0, 2);

          for (const rootMidi of rootList) {
            const expectedMidis = expectedMidisFor(
              rootMidi,
              scaleKind,
              octaveSpan,
              pattern,
            );
            if (expectedMidis.length < 4) continue;
            const analysis = analyzeScaleFromFrames(frames, expectedMidis);
            const score = rankScore(analysis, expectedMidis, runs.length);
            if (!Number.isFinite(score)) continue;
            ranked.push({
              tonicPitchClass,
              scaleKind,
              rootMidi,
              octaveSpan,
              pattern,
              expectedMidis,
              scaleLabel: scaleDisplayLabel(tonicPitchClass, scaleKind),
              analysis,
              rankScore: score,
            });
          }
        }
      }
    }
  }

  ranked.sort((a, b) => b.rankScore - a.rankScore);
  const rawBest = preferHonestExerciseCandidate(ranked);
  if (
    !rawBest ||
    rawBest.analysis.summary.notesAnalyzed < 4 ||
    rawBest.rankScore < 28
  ) {
    // Incomplete round-trips can score below the usual match floor; still accept
    // when enough notes were measured on a clear tonic family.
    const soft =
      rawBest &&
      rawBest.pattern === "round_trip" &&
      rawBest.analysis.summary.notesAnalyzed >= 6 &&
      rawBest.rankScore > -20;
    if (!soft || !rawBest) {
      return { ok: false, reason: "no_match" };
    }
  }

  const aligned = alignAnalysisToDetectedOctave(
    rawBest.expectedMidis,
    rawBest.rootMidi,
    rawBest.analysis,
  );
  const best: ScaleCandidate = {
    ...rawBest,
    rootMidi: aligned.rootMidi,
    expectedMidis: aligned.expectedMidis,
    analysis: aligned.analysis,
  };

  const uniqueFamilies: ScaleCandidate[] = [];
  for (const c of ranked) {
    if (uniqueFamilies.some((u) => sameScaleFamily(u, c))) continue;
    uniqueFamilies.push(c);
    if (uniqueFamilies.length >= 4) break;
  }

  const second = uniqueFamilies[1];
  const ambiguous =
    !!second &&
    second.rankScore > best.rankScore - 10 &&
    (second.tonicPitchClass !== best.tonicPitchClass ||
      second.scaleKind !== best.scaleKind);

  return {
    ok: true,
    best,
    alternatives: uniqueFamilies.slice(0, 3),
    ambiguous,
  };
}

export function detectScaleFromAudio(
  mono: Float32Array,
  sampleRateHz: number,
): DetectScaleResult {
  const frames = collectPitchFrames(mono, sampleRateHz);
  return detectScaleFromFrames(frames);
}
