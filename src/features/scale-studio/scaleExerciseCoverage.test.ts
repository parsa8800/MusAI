import { describe, expect, it } from "vitest";
import {
  matchDetectedRunsToExpected,
  type StablePitchRun,
} from "@/lib/analyzePitch";
import {
  computeScaleSummary,
  listDetectedNoteLabels,
  notesFromExpectedMidis,
  type ScaleAnalysisResult,
} from "@/lib/analyzeScalePerformance";
import { formatNoteLabel, midiToHz } from "@/lib/intonation";
import {
  buildLoopMastery,
  isGreatAccuracyTake,
  scoreScaleAttempt,
} from "@/lib/scalePracticeProgress";
import type {
  ScalePracticeNoteRow,
  ScalePracticeSessionV1,
} from "@/lib/scalePracticeTypes";
import {
  accidentalNames,
  buildAscendingScaleMidis,
  buildScaleExerciseMidis,
  defaultRootMidiForTonic,
  expectedScaleNoteCount,
  keySignatureSummary,
  preferredTonicOption,
  scaleDisplayLabel,
  scaleIdFor,
  scaleStepsPerOctave,
  tonicAccidentalRows,
  type ScaleExerciseMotion,
  type ScaleKind,
} from "@/lib/scales";
import {
  buildMidiToVexKeyMap,
  vexKeysForMidisOrdered,
} from "@/lib/vexflowScaleSpelling";

const MAJOR_STEPS = [2, 2, 1, 2, 2, 2, 1] as const;
const MINOR_STEPS = [2, 1, 2, 2, 1, 2, 2] as const;
const MOTIONS: ScaleExerciseMotion[] = ["ascending", "descending", "up_down"];
const SPANS: Array<1 | 2> = [1, 2];
const KINDS: ScaleKind[] = ["major", "natural_minor"];

type ExerciseCase = {
  label: string;
  tonicLabel: string;
  pitchClass: number;
  kind: ScaleKind;
  span: 1 | 2;
  motion: ScaleExerciseMotion;
};

function allExerciseCases(): ExerciseCase[] {
  const out: ExerciseCase[] = [];
  for (const kind of KINDS) {
    for (const opt of tonicAccidentalRows(kind).flatMap((row) => row.keys)) {
      for (const span of SPANS) {
        for (const motion of MOTIONS) {
          const kindLabel = kind === "major" ? "major" : "natural minor";
          out.push({
            label: `${opt.label} ${kindLabel}, ${span} oct, ${motion}`,
            tonicLabel: opt.label,
            pitchClass: opt.pitchClass,
            kind,
            span,
            motion,
          });
        }
      }
    }
  }
  return out;
}

const CASES = allExerciseCases();

/** Independent of `buildAscendingScaleMidis` — walks whole/half steps. */
function independentExpectedMidis(
  rootMidi: number,
  kind: ScaleKind,
  span: 1 | 2,
  motion: ScaleExerciseMotion,
): number[] {
  const steps = kind === "major" ? MAJOR_STEPS : MINOR_STEPS;
  const up: number[] = [rootMidi];
  let m = rootMidi;
  for (let oct = 0; oct < span; oct++) {
    for (const s of steps) {
      m += s;
      up.push(m);
    }
  }
  if (motion === "ascending") return up;
  if (motion === "descending") return [...up].reverse();
  return [...up, ...up.slice(0, -1).reverse()];
}

function midiOctave(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

function pitchRun(midi: number, t0: number): StablePitchRun {
  const hz = midiToHz(midi);
  return {
    hz: [hz, hz, hz, hz, hz, hz],
    midiCenter: midi,
    medianHz: hz,
    frameCount: 6,
    timeStartSec: t0,
    timeEndSec: t0 + 0.25,
  };
}

function detectedRow(index: number, midi: number): ScalePracticeNoteRow {
  return {
    noteIndex: index,
    expectedMidi: midi,
    expectedNoteLabel: formatNoteLabel(midi),
    detectedMidi: midi,
    detectedNoteLabel: formatNoteLabel(midi),
    detectedHz: midiToHz(midi),
    centsDifference: 0,
    intonationBucket: "in_tune",
    missingData: false,
  };
}

function missingRow(index: number, midi: number): ScalePracticeNoteRow {
  return {
    noteIndex: index,
    expectedMidi: midi,
    expectedNoteLabel: formatNoteLabel(midi),
    detectedMidi: 0,
    detectedNoteLabel: "—",
    detectedHz: 0,
    centsDifference: 0,
    intonationBucket: "unknown",
    missingData: true,
  };
}

function rowsPlayingPrefix(
  expected: readonly number[],
  played: number,
): ScalePracticeNoteRow[] {
  return expected.map((midi, i) =>
    i < played ? detectedRow(i, midi) : missingRow(i, midi),
  );
}

function rowsSkippingIndex(
  expected: readonly number[],
  skip: number,
): ScalePracticeNoteRow[] {
  return expected.map((midi, i) =>
    i === skip ? missingRow(i, midi) : detectedRow(i, midi),
  );
}

function sessionFromRows(
  c: ExerciseCase,
  rootMidi: number,
  expected: number[],
  notes: ScalePracticeNoteRow[],
): ScalePracticeSessionV1 {
  return {
    schemaVersion: 1,
    sessionId: c.label,
    exerciseType: "scale_practice",
    recordedAt: "2026-09-10T00:00:00.000Z",
    scaleId: scaleIdFor(c.pitchClass, c.kind),
    scaleLabel: scaleDisplayLabel(c.pitchClass, c.kind),
    scaleKind: c.kind,
    tonicPitchClass: c.pitchClass,
    octaveSpan: c.span,
    octaveRangeLabel: `${formatNoteLabel(rootMidi)}–${formatNoteLabel(rootMidi + 12 * c.span)}`,
    rootMidi,
    expectedNotesMidi: expected,
    audioSourceType: "recorded",
    sampleRateHz: 48000,
    notes,
    summary: computeScaleSummary(notes),
  };
}

function spelledKeys(
  expected: number[],
  pitchClass: number,
  kind: ScaleKind,
  span: 1 | 2,
  rootMidi: number,
): string[] {
  const up = buildAscendingScaleMidis(rootMidi, kind, span);
  const map = buildMidiToVexKeyMap(up, pitchClass, kind);
  return vexKeysForMidisOrdered(expected, map, pitchClass, kind);
}

function parseVexKey(key: string): { letter: string; accidental: string; octave: number } {
  const m = key.match(/^([a-g])([b#]*)\/(\d+)$/i);
  expect(m, `vex key ${key}`).not.toBeNull();
  return {
    letter: m![1]!.toLowerCase(),
    accidental: m![2] ?? "",
    octave: Number(m![3]),
  };
}

function filledCount(slots: Array<number | null>): number {
  return slots.filter((hz) => hz != null).length;
}

/** Matches `scoreScaleAttempt` rounding: one decimal from `analyzed / expected`. */
function roundedCompletionScore(played: number, expectedLength: number): number {
  return Math.round((1000 * played) / expectedLength) / 10;
}

describe("scale exercise constructions (parameterized)", () => {
  it("covers every supported key, span, and direction", () => {
    expect(CASES.length).toBe(12 * KINDS.length * SPANS.length * MOTIONS.length);
    const majors = CASES.filter((c) => c.kind === "major").map((c) => c.tonicLabel);
    for (const name of ["C", "G", "D", "A", "E", "F", "B♭", "E♭"]) {
      expect(majors).toContain(name);
    }
  });

  it.each(CASES)("$label", (c) => {
    const rootMidi = defaultRootMidiForTonic(c.pitchClass);
    const expected = buildScaleExerciseMidis(
      rootMidi,
      c.kind,
      c.span,
      c.motion,
    );
    const spec = independentExpectedMidis(
      rootMidi,
      c.kind,
      c.span,
      c.motion,
    );
    const n = expectedScaleNoteCount(c.span, c.motion, c.kind);
    const oneWay = scaleStepsPerOctave(c.kind) * c.span + 1;
    const startOctave = midiOctave(rootMidi);
    const endOctave = startOctave + c.span;

    expect(expected).toEqual(spec);
    expect(expected).toHaveLength(n);
    expect(expected.length).toBe(spec.length);
    expect(n).not.toBe(0);

    if (c.motion === "ascending") {
      expect(expected[0]).toBe(rootMidi);
      expect(expected.at(-1)).toBe(rootMidi + 12 * c.span);
      expect(midiOctave(expected[0]!)).toBe(startOctave);
      expect(midiOctave(expected.at(-1)!)).toBe(endOctave);
      for (let i = 1; i < expected.length; i++) {
        expect(expected[i]!).toBeGreaterThan(expected[i - 1]!);
      }
    } else if (c.motion === "descending") {
      expect(expected[0]).toBe(rootMidi + 12 * c.span);
      expect(expected.at(-1)).toBe(rootMidi);
      expect(midiOctave(expected[0]!)).toBe(endOctave);
      expect(midiOctave(expected.at(-1)!)).toBe(startOctave);
      for (let i = 1; i < expected.length; i++) {
        expect(expected[i]!).toBeLessThan(expected[i - 1]!);
      }
    } else {
      expect(expected[0]).toBe(rootMidi);
      expect(expected.at(-1)).toBe(rootMidi);
      expect(expected[oneWay - 1]).toBe(rootMidi + 12 * c.span);
      expect(expected[oneWay]).not.toBe(expected[oneWay - 1]);
      expect(expected[oneWay]).toBe(expected[oneWay - 2]);
      const peak = Math.max(...expected);
      expect(expected.filter((m) => m === peak)).toHaveLength(1);
      expect(midiOctave(expected[0]!)).toBe(startOctave);
      expect(midiOctave(expected[oneWay - 1]!)).toBe(endOctave);
      expect(midiOctave(expected.at(-1)!)).toBe(startOctave);
    }

    const keys = spelledKeys(
      expected,
      c.pitchClass,
      c.kind,
      c.span,
      rootMidi,
    );
    expect(keys).toHaveLength(expected.length);
    const names = accidentalNames(preferredTonicOption(c.pitchClass, c.kind));
    for (const name of names) {
      const letter = name.match(/[A-G]/i)?.[0]?.toLowerCase();
      const acc = /[♯#]/.test(name) ? "#" : "b";
      expect(letter).toBeTruthy();
      expect(
        keys.some((k) => {
          const p = parseVexKey(k);
          return p.letter === letter && p.accidental === acc;
        }),
      ).toBe(true);
    }
    if (names.length === 0) {
      expect(keys.every((k) => parseVexKey(k).accidental === "")).toBe(true);
    }

    const empty = sessionFromRows(
      c,
      rootMidi,
      expected,
      rowsPlayingPrefix(expected, 0),
    );
    expect(empty.summary.notesAnalyzed).toBe(0);
    expect(empty.summary.notesMissing).toBe(expected.length);
    expect(scoreScaleAttempt(empty).completionScore).toBe(0);
    expect(buildLoopMastery([]).percent).toBe(0);
    expect(buildLoopMastery([empty]).percent).toBe(0);
    expect(buildLoopMastery([empty]).attemptScore).toBe(0);

    const partialPlayed = Math.min(4, expected.length);
    const partial = sessionFromRows(
      c,
      rootMidi,
      expected,
      rowsPlayingPrefix(expected, partialPlayed),
    );
    expect(partial.summary.notesAnalyzed).toBe(partialPlayed);
    expect(partial.summary.notesMissing).toBe(expected.length - partialPlayed);
    expect(partial.summary.notesAnalyzed + partial.summary.notesMissing).toBe(
      expected.length,
    );
    const partialScore = scoreScaleAttempt(partial);
    expect(partial.summary.notesAnalyzed / expected.length).toBe(
      partialPlayed / expected.length,
    );
    expect(partialScore.completionScore).toBe(
      roundedCompletionScore(partialPlayed, expected.length),
    );
    expect(partialScore.completionScore).toBeLessThan(100);
    expect(isGreatAccuracyTake(partial)).toBe(false);
    const partialMastery = buildLoopMastery([partial]);
    expect(partialMastery.percent).toBeLessThan(100);
    expect(partialMastery.attemptScore).toBe(Math.round(partialScore.attemptScore));

    const full = sessionFromRows(
      c,
      rootMidi,
      expected,
      rowsPlayingPrefix(expected, expected.length),
    );
    expect(full.summary.notesAnalyzed).toBe(expected.length);
    expect(full.summary.notesMissing).toBe(0);
    expect(scoreScaleAttempt(full).completionScore).toBe(100);
    expect(isGreatAccuracyTake(full)).toBe(true);
    const fullMastery = buildLoopMastery([full]);
    expect(fullMastery.attemptScore).toBeGreaterThan(0);
    expect(fullMastery.percent).toBeGreaterThan(0);
    expect(fullMastery.percent).toBeLessThanOrEqual(100);

    const skipped = sessionFromRows(
      c,
      rootMidi,
      expected,
      rowsSkippingIndex(expected, 2),
    );
    expect(skipped.summary.notesAnalyzed).toBe(expected.length - 1);
    expect(skipped.summary.notesMissing).toBe(1);
    expect(skipped.notes[2]!.missingData).toBe(true);
    expect(listDetectedNoteLabels(skipped.notes)).toHaveLength(
      expected.length - 1,
    );
    expect(scoreScaleAttempt(skipped).completionScore).toBe(
      roundedCompletionScore(expected.length - 1, expected.length),
    );
    expect(scoreScaleAttempt(skipped).completionScore).toBeLessThan(100);
    expect(isGreatAccuracyTake(skipped)).toBe(false);

    const prefixRuns = expected
      .slice(0, partialPlayed)
      .map((midi, i) => pitchRun(midi, i * 0.4));
    const prefixSlots = matchDetectedRunsToExpected(prefixRuns, expected);
    expect(filledCount(prefixSlots)).toBe(partialPlayed);
    expect(prefixSlots.slice(partialPlayed).every((hz) => hz == null)).toBe(
      true,
    );

    const repeatedTonic = Array.from({ length: 5 }, (_, i) =>
      pitchRun(expected[0]!, i * 0.4),
    );
    const repeatedSlots = matchDetectedRunsToExpected(repeatedTonic, expected);
    expect(filledCount(repeatedSlots)).toBe(1);
    expect(repeatedSlots[0]).not.toBeNull();
    expect(repeatedSlots.slice(1).every((hz) => hz == null)).toBe(true);

    const unrelatedMidi = expected[0]! + 6;
    const unrelatedSlots = matchDetectedRunsToExpected(
      [pitchRun(unrelatedMidi, 0), pitchRun(unrelatedMidi, 0.4)],
      expected,
    );
    expect(filledCount(unrelatedSlots)).toBe(0);

    const fakeFrames = prefixRuns.flatMap((run, i) =>
      Array.from({ length: 6 }, (_, f) => ({
        timeSec: i * 0.4 + f * 0.05,
        hz: run.medianHz,
        clarity: 0.95,
      })),
    );
    const fromNotes: ScaleAnalysisResult = {
      frames: fakeFrames,
      notes: notesFromExpectedMidis(fakeFrames, expected),
      summary: computeScaleSummary(notesFromExpectedMidis(fakeFrames, expected)),
    };
    expect(fromNotes.notes).toHaveLength(expected.length);
    const heard = fromNotes.notes.filter((n) => !n.missingData);
    expect(heard.length).toBe(partialPlayed);
    expect(heard.every((n) => n.detectedNoteLabel !== "—")).toBe(true);
    expect(
      fromNotes.notes
        .filter((n) => n.missingData)
        .every((n) => n.detectedNoteLabel === "—" && n.detectedMidi === 0),
    ).toBe(true);
    expect(listDetectedNoteLabels(fromNotes.notes)).toHaveLength(partialPlayed);
  });
});

describe("named scale constructions", () => {
  it("C major, 1 octave, ascending is C D E F G A B C", () => {
    const midis = buildScaleExerciseMidis(60, "major", 1, "ascending");
    expect(midis.map(formatNoteLabel)).toEqual([
      "C4",
      "D4",
      "E4",
      "F4",
      "G4",
      "A4",
      "B4",
      "C5",
    ]);
    expect(midis).toHaveLength(expectedScaleNoteCount(1, "ascending"));
  });

  it("C major, 1 octave, up+down is 15 positions without a doubled peak tonic", () => {
    const midis = buildScaleExerciseMidis(60, "major", 1, "up_down");
    expect(midis.map(formatNoteLabel)).toEqual([
      "C4",
      "D4",
      "E4",
      "F4",
      "G4",
      "A4",
      "B4",
      "C5",
      "B4",
      "A4",
      "G4",
      "F4",
      "E4",
      "D4",
      "C4",
    ]);
    expect(midis).toHaveLength(expectedScaleNoteCount(1, "up_down"));
    expect(midis[7]).toBe(72);
    expect(midis[8]).toBe(71);
    expect(midis.filter((m) => m === 72)).toHaveLength(1);
  });

  it("C major, 2 octaves, ascending walks C4 through C6", () => {
    const midis = buildScaleExerciseMidis(60, "major", 2, "ascending");
    expect(midis[0]).toBe(60);
    expect(midis.at(-1)).toBe(84);
    expect(midis).toHaveLength(expectedScaleNoteCount(2, "ascending"));
    expect(midis).toEqual(independentExpectedMidis(60, "major", 2, "ascending"));
  });

  it("C major, 2 octaves, up+down uses expectedSequence.length (29) and one peak C", () => {
    const midis = buildScaleExerciseMidis(60, "major", 2, "up_down");
    expect(midis).toHaveLength(expectedScaleNoteCount(2, "up_down"));
    expect(midis.filter((m) => m === 84)).toHaveLength(1);
    expect(midis[14]).toBe(84);
    expect(midis[15]).toBe(83);
    const four = rowsPlayingPrefix(midis, 4);
    const session: ScalePracticeSessionV1 = {
      schemaVersion: 1,
      sessionId: "c2",
      exerciseType: "scale_practice",
      recordedAt: "2026-09-10T00:00:00.000Z",
      scaleId: "C_major",
      scaleLabel: "C major",
      scaleKind: "major",
      tonicPitchClass: 0,
      octaveSpan: 2,
      octaveRangeLabel: "C4–C6",
      rootMidi: 60,
      expectedNotesMidi: midis,
      audioSourceType: "recorded",
      sampleRateHz: 48000,
      notes: four,
      summary: computeScaleSummary(four),
    };
    expect(session.summary.notesAnalyzed).toBe(4);
    expect(session.summary.notesAnalyzed / midis.length).toBe(4 / midis.length);
    expect(scoreScaleAttempt(session).completionScore).toBe(
      roundedCompletionScore(4, midis.length),
    );
    expect(scoreScaleAttempt(session).completionScore).not.toBe(100);
  });

  it("D major uses F♯ and C♯", () => {
    const root = defaultRootMidiForTonic(2);
    const midis = buildScaleExerciseMidis(root, "major", 1, "ascending");
    const pcs = new Set(midis.map((m) => ((m % 12) + 12) % 12));
    expect(pcs.has(6)).toBe(true);
    expect(pcs.has(1)).toBe(true);
    expect(pcs.has(5)).toBe(false);
    expect(pcs.has(0)).toBe(false);
    const keys = spelledKeys(midis, 2, "major", 1, root);
    expect(keys.some((k) => k.startsWith("f#/"))).toBe(true);
    expect(keys.some((k) => k.startsWith("c#/"))).toBe(true);
    const summary = keySignatureSummary(preferredTonicOption(2, "major"), "major");
    expect(summary.accidentalNames).toEqual(["F♯", "C♯"]);
  });

  it("B♭ major uses B♭ and E♭", () => {
    const root = defaultRootMidiForTonic(10);
    const midis = buildScaleExerciseMidis(root, "major", 1, "ascending");
    const pcs = new Set(midis.map((m) => ((m % 12) + 12) % 12));
    expect(pcs.has(10)).toBe(true);
    expect(pcs.has(3)).toBe(true);
    const keys = spelledKeys(midis, 10, "major", 1, root);
    expect(keys[0]!.startsWith("bb/")).toBe(true);
    expect(keys.some((k) => k.startsWith("eb/"))).toBe(true);
    const summary = keySignatureSummary(
      preferredTonicOption(10, "major"),
      "major",
    );
    expect(summary.accidentalNames).toEqual(["B♭", "E♭"]);
  });
});
