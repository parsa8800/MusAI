import { analyzeScaleFromFrames } from "@/lib/analyzeScalePerformance";
import {
  collectPitchFrames,
  collectStablePitchRuns,
  hzToMidi,
  type PitchFrame,
} from "@/lib/analyzePitch";
import { alignAnalysisToDetectedOctave } from "@/lib/alignScaleOctave";
import { SCALE_IDENTIFY } from "@/lib/scaleIdentifyConfig";
import { detectScaleDescentIntent } from "@/lib/scaleDescentIntent";
import {
  buildAscendingScaleMidis,
  buildExerciseScaleMidis,
  scaleDisplayLabel,
  type ScaleKind,
} from "@/lib/scales";
import { rootsForTonic, validateScaleMidisInRange } from "@/lib/instrument/scale";
import { getActiveInstrument } from "@/lib/instrument/storage";
import type { InstrumentProfile } from "@/lib/instrument/types";
import type { ScaleAnalysisResult } from "@/lib/analyzeScalePerformance";

export type ScalePattern = "round_trip" | "ascending";

export type ScaleIdentityHint = {
  tonicPitchClass: number;
  scaleKind: ScaleKind;
  octaveSpan: 1 | 2;
};

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
      /** Best ranked candidate matching a locked practice hint, if any. */
      hinted: ScaleCandidate | null;
    }
  | { ok: false; reason: "no_pitch" | "no_match" };

export function candidateMatchesHint(
  candidate: Pick<
    ScaleCandidate,
    "tonicPitchClass" | "scaleKind" | "octaveSpan"
  >,
  hint: ScaleIdentityHint,
): boolean {
  return (
    candidate.tonicPitchClass === hint.tonicPitchClass &&
    candidate.scaleKind === hint.scaleKind &&
    candidate.octaveSpan === hint.octaveSpan
  );
}

export function hintFromCandidate(
  candidate: Pick<
    ScaleCandidate,
    "tonicPitchClass" | "scaleKind" | "octaveSpan"
  >,
): ScaleIdentityHint {
  return {
    tonicPitchClass: candidate.tonicPitchClass,
    scaleKind: candidate.scaleKind,
    octaveSpan: candidate.octaveSpan,
  };
}

function findHintedCandidate(
  ranked: readonly ScaleCandidate[],
  hint: ScaleIdentityHint,
): ScaleCandidate | undefined {
  return ranked.find((c) => candidateMatchesHint(c, hint));
}

type RunHint = { midiCenter: number };

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

function pitchClassFromMidi(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

function nearestOctaveSemitoneDistance(
  detectedMidi: number,
  expectedMidi: number,
): number {
  let best = Math.abs(detectedMidi - expectedMidi);
  for (let k = -2; k <= 2; k++) {
    best = Math.min(best, Math.abs(detectedMidi + 12 * k - expectedMidi));
  }
  return best;
}

/** Prefer expected midis near the take’s pitch (ignore pure octave leaps). */
function octaveMismatchPenalty(
  analysis: ScaleAnalysisResult,
  expectedMidis: readonly number[],
): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < expectedMidis.length; i++) {
    const note = analysis.notes[i];
    if (!note || note.missingData) continue;
    sum += nearestOctaveSemitoneDistance(note.detectedMidi, expectedMidis[i]!);
    n += 1;
  }
  if (n === 0) return 50;
  return (sum / n) * 2.4;
}

function pitchClassMatchBonus(
  analysis: ScaleAnalysisResult,
  expectedMidis: readonly number[],
): number {
  let hits = 0;
  let n = 0;
  for (let i = 0; i < expectedMidis.length; i++) {
    const note = analysis.notes[i];
    if (!note || note.missingData) continue;
    n += 1;
    if (
      pitchClassFromMidi(note.detectedMidi) ===
      pitchClassFromMidi(expectedMidis[i]!)
    ) {
      hits += 1;
    }
  }
  if (n === 0) return 0;
  return (hits / n) * 12;
}

/** Opening of a scale take is a strong tonic cue. */
function openingTonicBonus(
  tonicPitchClass: number,
  runs: RunHint[],
  frames: PitchFrame[],
): number {
  if (runs.length > 0) {
    if (pitchClassFromMidi(runs[0]!.midiCenter) === tonicPitchClass) return 24;
  }
  if (frames.length === 0) return 0;
  const early = frames.slice(0, Math.max(4, Math.floor(frames.length * 0.2)));
  const counts = new Array(12).fill(0) as number[];
  for (const f of early) {
    counts[pitchClassFromMidi(hzToMidi(f.hz))]! += 1;
  }
  let mode = 0;
  for (let i = 1; i < 12; i++) {
    if (counts[i]! > counts[mode]!) mode = i;
  }
  return mode === tonicPitchClass ? 16 : 0;
}

function distinctRunPitchClasses(runs: RunHint[]): number {
  const set = new Set<number>();
  for (const r of runs) set.add(pitchClassFromMidi(r.midiCenter));
  return set.size;
}

function medianFrameMidi(frames: PitchFrame[]): number {
  const midis = frames.map((f) => hzToMidi(f.hz)).sort((a, b) => a - b);
  return midis[Math.floor(midis.length / 2)]!;
}

function rankScore(
  analysis: ScaleAnalysisResult,
  expectedMidis: readonly number[],
  runCount: number,
  tonicPitchClass: number,
  runs: RunHint[],
  frames: PitchFrame[],
): number {
  const { summary } = analysis;
  if (summary.notesAnalyzed === 0) return Number.NEGATIVE_INFINITY;
  const expectedLen = expectedMidis.length;
  const cover = summary.notesAnalyzed / Math.max(1, expectedLen);
  const missingPenalty = summary.notesMissing * 3;
  const lengthHint =
    runCount > 0 ? Math.abs(expectedLen - runCount) * 1.8 : 0;
  return (
    summary.overallScore0to100 * cover -
    missingPenalty -
    lengthHint -
    octaveMismatchPenalty(analysis, expectedMidis) +
    pitchClassMatchBonus(analysis, expectedMidis) +
    openingTonicBonus(tonicPitchClass, runs, frames)
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
  runs: RunHint[],
): ScaleCandidate | undefined {
  const best = ranked[0];
  if (!best) return undefined;

  const roundTripSibling = ranked.find(
    (c) =>
      c.pattern === "round_trip" &&
      c.tonicPitchClass === best.tonicPitchClass &&
      c.scaleKind === best.scaleKind &&
      c.octaveSpan === best.octaveSpan &&
      Math.abs(c.rootMidi - best.rootMidi) <= 1 &&
      c.analysis.summary.notesAnalyzed >= 4,
  );

  const ascendingMidis =
    best.pattern === "ascending"
      ? best.expectedMidis
      : buildAscendingScaleMidis(
          best.rootMidi,
          best.scaleKind,
          best.octaveSpan,
        );

  if (
    best.pattern === "ascending" &&
    detectScaleDescentIntent(runs, ascendingMidis) &&
    roundTripSibling
  ) {
    return roundTripSibling;
  }

  if (best.pattern !== "ascending") return best;
  if (!roundTripSibling) return best;
  const roundTrip = roundTripSibling;

  const ascAnalyzed = best.analysis.summary.notesAnalyzed;
  const rtAnalyzed = roundTrip.analysis.summary.notesAnalyzed;

  // Never replace a strong long ascent with a collapsed round-trip (e.g. a
  // 2-octave ascent beating an empty 2-octave round-trip by ~150 points).
  if (roundTrip.rankScore < best.rankScore - 20) {
    const shortAscent = best.expectedMidis.length <= 8;
    if (shortAscent && rtAnalyzed >= Math.max(6, ascAnalyzed)) {
      return roundTrip;
    }
    return best;
  }

  // Incomplete take: round-trip maps more of the audio onto the full exercise.
  if (rtAnalyzed >= ascAnalyzed) return roundTrip;
  // Ascending only barely beats round-trip → keep the full exercise.
  if (roundTrip.rankScore > best.rankScore - 45) return roundTrip;
  return best;
}

export function detectScaleFromFrames(
  frames: PitchFrame[],
  instrument: InstrumentProfile = getActiveInstrument(),
  opts?: { hint?: ScaleIdentityHint },
): DetectScaleResult {
  if (frames.length < 4) return { ok: false, reason: "no_pitch" };

  const runs = collectStablePitchRuns(frames);
  // A real scale spans several pitch classes; reject single-note drones.
  if (distinctRunPitchClasses(runs) < 4) {
    return { ok: false, reason: "no_match" };
  }

  const anchorMidi = medianFrameMidi(frames);
  const kinds: ScaleKind[] = ["major", "natural_minor"];
  const spans: Array<1 | 2> = [1, 2];
  const patterns: ScalePattern[] = ["round_trip", "ascending"];

  const ranked: ScaleCandidate[] = [];

  for (const scaleKind of kinds) {
    for (const octaveSpan of spans) {
      for (const pattern of patterns) {
        for (let tonicPitchClass = 0; tonicPitchClass < 12; tonicPitchClass++) {
          const allRoots = rootsForTonic(tonicPitchClass, instrument);
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
            if (!validateScaleMidisInRange(expectedMidis, instrument)) continue;
            const analysis = analyzeScaleFromFrames(frames, expectedMidis);
            const score = rankScore(
              analysis,
              expectedMidis,
              runs.length,
              tonicPitchClass,
              runs,
              frames,
            );
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
  const rawBest = preferHonestExerciseCandidate(ranked, runs);
  if (
    !rawBest ||
    rawBest.analysis.summary.notesAnalyzed < 4 ||
    rawBest.rankScore < 22
  ) {
    // Incomplete round-trips can score below the usual match floor; still accept
    // when enough notes were measured on a clear tonic family.
    const soft =
      rawBest &&
      rawBest.pattern === "round_trip" &&
      rawBest.analysis.summary.notesAnalyzed >= 6 &&
      rawBest.rankScore > -80;
    if (!soft || !rawBest) {
      return { ok: false, reason: "no_match" };
    }
  }

  const aligned = alignAnalysisToDetectedOctave(
    rawBest.expectedMidis,
    rawBest.rootMidi,
    rawBest.analysis,
    instrument,
  );
  const best: ScaleCandidate = {
    ...rawBest,
    rootMidi: aligned.rootMidi,
    expectedMidis: aligned.expectedMidis,
    analysis: aligned.analysis,
  };

  let resolved = best;
  if (resolved.pattern === "ascending") {
    const ascendingMidis = resolved.expectedMidis;
    if (detectScaleDescentIntent(runs, ascendingMidis)) {
      const expectedMidis = buildExerciseScaleMidis(
        resolved.rootMidi,
        resolved.scaleKind,
        resolved.octaveSpan,
      );
      if (validateScaleMidisInRange(expectedMidis, instrument)) {
        const analysis = analyzeScaleFromFrames(frames, expectedMidis);
        const realigned = alignAnalysisToDetectedOctave(
          expectedMidis,
          resolved.rootMidi,
          analysis,
          instrument,
        );
        resolved = {
          ...resolved,
          pattern: "round_trip",
          rootMidi: realigned.rootMidi,
          expectedMidis: realigned.expectedMidis,
          analysis: realigned.analysis,
          rankScore: rankScore(
            realigned.analysis,
            realigned.expectedMidis,
            runs.length,
            resolved.tonicPitchClass,
            runs,
            frames,
          ),
        };
      }
    }
  }

  const uniqueFamilies: ScaleCandidate[] = [];
  for (const c of ranked) {
    if (uniqueFamilies.some((u) => sameScaleFamily(u, c))) continue;
    uniqueFamilies.push(c);
    if (uniqueFamilies.length >= 4) break;
  }

  const second = uniqueFamilies[1];
  const differentFamily =
    !!second &&
    (second.tonicPitchClass !== resolved.tonicPitchClass ||
      second.scaleKind !== resolved.scaleKind);
  const close =
    !!second &&
    second.rankScore > resolved.rankScore - SCALE_IDENTIFY.firstTakeCloseGap;
  const bothStrong =
    resolved.rankScore >= SCALE_IDENTIFY.firstTakeMinRank &&
    (second?.rankScore ?? Number.NEGATIVE_INFINITY) >=
      SCALE_IDENTIFY.firstTakeMinRank;
  const ambiguous = Boolean(differentFamily && close && bothStrong);

  const hinted = opts?.hint
    ? (findHintedCandidate(ranked, opts.hint) ?? null)
    : null;

  return {
    ok: true,
    best: resolved,
    alternatives: uniqueFamilies.slice(0, 3),
    ambiguous,
    hinted,
  };
}

export function detectScaleFromAudio(
  mono: Float32Array,
  sampleRateHz: number,
  instrument: InstrumentProfile = getActiveInstrument(),
  opts?: { hint?: ScaleIdentityHint },
): DetectScaleResult {
  const frames = collectPitchFrames(mono, sampleRateHz, {
    mode: "scale",
    minHz: instrument.pitch.minHz,
    maxHz: instrument.pitch.practiceMaxHz,
  });
  return detectScaleFromFrames(frames, instrument, opts);
}
