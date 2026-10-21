import { describe, expect, it } from "vitest";
import {
  collectPitchFrames,
  collectStablePitchRuns,
  hzToMidi,
  matchDetectedRunsToExpected,
  type PitchFrame,
  type StablePitchRun,
} from "@/lib/analyzePitch";
import {
  analyzeScaleFromFrames,
  analyzeScalePerformance,
  listDetectedNoteLabels,
} from "@/lib/scaleNoteDetection";
import { formatNoteLabel, midiToHz } from "@/lib/intonation";
import {
  buildExerciseScaleMidis,
  buildScaleExerciseMidis,
} from "@/lib/scales";

/** C major 1-octave round trip: C4…C5…C4 (15 notes). */
const C_MAJOR = buildExerciseScaleMidis(60, "major", 1);

function pitchRun(
  midi: number,
  opts?: { frames?: number; t0?: number; dt?: number; cents?: number },
): StablePitchRun {
  const frames = opts?.frames ?? 6;
  const t0 = opts?.t0 ?? 0;
  const dt = opts?.dt ?? 0.05;
  const cents = opts?.cents ?? 0;
  const hz = midiToHz(midi) * Math.pow(2, cents / 1200);
  return {
    hz: Array.from({ length: frames }, () => hz),
    midiCenter: midi + cents / 100,
    medianHz: hz,
    frameCount: frames,
    timeStartSec: t0,
    timeEndSec: t0 + Math.max(0, frames - 1) * dt,
  };
}

function runsFromMidis(midis: readonly number[]): StablePitchRun[] {
  return midis.map((midi, i) => pitchRun(midi, { t0: i * 0.4 }));
}

function filledExpectedLabels(
  slots: Array<number | null>,
  expectedMidis: readonly number[],
): string[] {
  return expectedMidis.flatMap((midi, i) =>
    slots[i] != null ? [formatNoteLabel(midi)] : [],
  );
}

function framesFromHzTimeline(
  timeline: Array<{ hz: number; count: number; clarity?: number }>,
  dt = 0.05,
): PitchFrame[] {
  const out: PitchFrame[] = [];
  let t = 0;
  for (const step of timeline) {
    for (let i = 0; i < step.count; i++) {
      out.push({
        timeSec: t,
        hz: step.hz,
        clarity: step.clarity ?? 0.95,
      });
      t += dt;
    }
  }
  return out;
}

function concatAudio(parts: Float32Array[]): Float32Array {
  const n = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Float32Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function sine(
  hz: number,
  sampleRate: number,
  sec: number,
  amp = 0.85,
): Float32Array {
  const n = Math.max(0, Math.floor(sampleRate * sec));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = Math.sin((2 * Math.PI * hz * i) / sampleRate) * amp;
  }
  return out;
}

function silence(sampleRate: number, sec: number): Float32Array {
  return new Float32Array(Math.max(0, Math.floor(sampleRate * sec)));
}

function synthMidiNotes(
  midis: readonly number[],
  opts?: {
    sampleRate?: number;
    secondsPerNote?: number;
    gapSec?: number;
    centsOffsets?: readonly number[];
    prefixSilenceSec?: number;
    suffixSilenceSec?: number;
  },
): { mono: Float32Array; sampleRateHz: number } {
  const sampleRate = opts?.sampleRate ?? 44100;
  const secondsPerNote = opts?.secondsPerNote ?? 0.4;
  const gapSec = opts?.gapSec ?? 0.05;
  const parts: Float32Array[] = [];
  if ((opts?.prefixSilenceSec ?? 0) > 0) {
    parts.push(silence(sampleRate, opts!.prefixSilenceSec!));
  }
  for (let i = 0; i < midis.length; i++) {
    const cents = opts?.centsOffsets?.[i] ?? 0;
    const hz = midiToHz(midis[i]!) * Math.pow(2, cents / 1200);
    parts.push(sine(hz, sampleRate, secondsPerNote));
    if (i < midis.length - 1 && gapSec > 0) {
      parts.push(silence(sampleRate, gapSec));
    }
  }
  if ((opts?.suffixSilenceSec ?? 0) > 0) {
    parts.push(silence(sampleRate, opts!.suffixSilenceSec!));
  }
  return { mono: concatAudio(parts), sampleRateHz: sampleRate };
}

function addWhiteNoise(mono: Float32Array, amplitude: number): Float32Array {
  const out = new Float32Array(mono.length);
  for (let i = 0; i < mono.length; i++) {
    out[i] = mono[i]! + (Math.random() * 2 - 1) * amplitude;
  }
  return out;
}

function filledCount(slots: Array<number | null>): number {
  return slots.filter((hz) => hz != null).length;
}

function expectExactDetected(
  notes: {
    missingData: boolean;
    detectedNoteLabel: string;
    detectedMidi: number;
  }[],
  expectedLabels: string[],
) {
  expect(
    listDetectedNoteLabels(
      notes as unknown as Parameters<typeof listDetectedNoteLabels>[0],
    ),
  ).toEqual(expectedLabels);
  expect(notes.filter((n) => !n.missingData)).toHaveLength(expectedLabels.length);
  for (const row of notes) {
    if (row.missingData) {
      expect(row.detectedMidi).toBe(0);
      expect(row.detectedNoteLabel).toBe("—");
    }
  }
}

describe("scale note detection contract", () => {
  describe("matchDetectedRunsToExpected", () => {
    it("only the first note of a scale is played", () => {
      const slots = matchDetectedRunsToExpected(runsFromMidis([60]), C_MAJOR);
      expect(filledExpectedLabels(slots, C_MAJOR)).toEqual(["C4"]);
      expect(slots.slice(1).every((hz) => hz == null)).toBe(true);
    });

    it("only 2 notes are played", () => {
      const slots = matchDetectedRunsToExpected(
        runsFromMidis([60, 62]),
        C_MAJOR,
      );
      expect(filledExpectedLabels(slots, C_MAJOR)).toEqual(["C4", "D4"]);
    });

    it("only 3 notes are played", () => {
      const slots = matchDetectedRunsToExpected(
        runsFromMidis([60, 62, 64]),
        C_MAJOR,
      );
      expect(filledExpectedLabels(slots, C_MAJOR)).toEqual(["C4", "D4", "E4"]);
    });

    it("half the scale is played", () => {
      const half = C_MAJOR.slice(0, 8);
      const slots = matchDetectedRunsToExpected(runsFromMidis(half), C_MAJOR);
      expect(filledExpectedLabels(slots, C_MAJOR)).toEqual(
        half.map((m) => formatNoteLabel(m)),
      );
      expect(slots.slice(8).every((hz) => hz == null)).toBe(true);
    });

    it("the complete scale is played", () => {
      const slots = matchDetectedRunsToExpected(
        runsFromMidis(C_MAJOR),
        C_MAJOR,
      );
      expect(filledExpectedLabels(slots, C_MAJOR)).toEqual(
        C_MAJOR.map((m) => formatNoteLabel(m)),
      );
      expect(slots.every((hz) => hz != null)).toBe(true);
    });

    it("notes are played in the wrong order", () => {
      const slots = matchDetectedRunsToExpected(
        runsFromMidis([62, 60]),
        C_MAJOR,
      );
      expect(filledExpectedLabels(slots, C_MAJOR).sort()).toEqual(["C4", "D4"]);
      expect(slots.slice(2).every((hz) => hz == null)).toBe(true);
    });

    it("one expected note is skipped", () => {
      const played = [60, 62, 64, 65, 69, 71, 72];
      const slots = matchDetectedRunsToExpected(runsFromMidis(played), C_MAJOR);
      expect(filledExpectedLabels(slots, C_MAJOR)).toEqual([
        "C4",
        "D4",
        "E4",
        "F4",
        "A4",
        "B4",
        "C5",
      ]);
      expect(slots[4]).toBeNull();
    });

    it("multiple expected notes are skipped", () => {
      const played = [60, 64, 67];
      const slots = matchDetectedRunsToExpected(runsFromMidis(played), C_MAJOR);
      expect(filledExpectedLabels(slots, C_MAJOR)).toEqual(["C4", "E4", "G4"]);
      expect(slots[1]).toBeNull();
      expect(slots[3]).toBeNull();
    });

    it("the same note is played twice does not invent the octave tonic", () => {
      const slots = matchDetectedRunsToExpected(
        runsFromMidis([60, 60]),
        C_MAJOR,
      );
      expect(filledExpectedLabels(slots, C_MAJOR)).toEqual(["C4"]);
      expect(slots[7]).toBeNull();
    });

    it("a completely incorrect note is not assigned to a scale degree", () => {
      const slots = matchDetectedRunsToExpected(runsFromMidis([66]), C_MAJOR);
      expect(filledExpectedLabels(slots, C_MAJOR)).toEqual([]);
      expect(slots.every((hz) => hz == null)).toBe(true);
    });

    it("silence yields no detections", () => {
      const slots = matchDetectedRunsToExpected([], C_MAJOR);
      expect(filledExpectedLabels(slots, C_MAJOR)).toEqual([]);
    });

    it("only the final tonic is played — does not complete the scale", () => {
      const last = C_MAJOR[C_MAJOR.length - 1]!;
      const slots = matchDetectedRunsToExpected(runsFromMidis([last]), C_MAJOR);
      expect(filledCount(slots)).toBeLessThanOrEqual(1);
      expect(filledCount(slots)).toBeLessThan(C_MAJOR.length);
    });

    it("skipping the first expected note still maps later degrees", () => {
      const slots = matchDetectedRunsToExpected(
        runsFromMidis([62, 64, 65]),
        C_MAJOR,
      );
      expect(slots[0]).toBeNull();
      expect(filledExpectedLabels(slots, C_MAJOR)).toEqual(["D4", "E4", "F4"]);
    });

    it("skipping the final expected note leaves the last slot missing", () => {
      const withoutLast = C_MAJOR.slice(0, -1);
      const slots = matchDetectedRunsToExpected(
        runsFromMidis(withoutLast),
        C_MAJOR,
      );
      expect(slots.at(-1)).toBeNull();
      expect(filledCount(slots)).toBe(withoutLast.length);
    });

    it("a wrong note between two correct notes does not invent the skipped degree", () => {
      const slots = matchDetectedRunsToExpected(
        runsFromMidis([60, 66, 62]),
        C_MAJOR,
      );
      expect(filledExpectedLabels(slots, C_MAJOR)).toEqual(["C4", "D4"]);
      expect(slots[2]).toBeNull();
    });

    it("several wrong notes in a row do not advance the scale", () => {
      const slots = matchDetectedRunsToExpected(
        runsFromMidis([60, 66, 68, 70, 62]),
        C_MAJOR,
      );
      expect(filledExpectedLabels(slots, C_MAJOR)).toEqual(["C4", "D4"]);
      expect(slots.slice(2).every((hz) => hz == null)).toBe(true);
    });

    it("restarting the scale halfway does not refill earlier slots or skip ahead", () => {
      const slots = matchDetectedRunsToExpected(
        runsFromMidis([60, 62, 64, 65, 60, 62, 64]),
        C_MAJOR,
      );
      expect(filledExpectedLabels(slots, C_MAJOR)).toEqual([
        "C4",
        "D4",
        "E4",
        "F4",
      ]);
      expect(slots[7]).toBeNull();
    });

    it("playing the opening twice does not count as two passes", () => {
      const slots = matchDetectedRunsToExpected(
        runsFromMidis([60, 62, 64, 60, 62, 64]),
        C_MAJOR,
      );
      expect(filledExpectedLabels(slots, C_MAJOR)).toEqual(["C4", "D4", "E4"]);
    });

    it("descending pitches during an ascending exercise do not fill the ascent", () => {
      const up = buildScaleExerciseMidis(60, "major", 1, "ascending");
      const slots = matchDetectedRunsToExpected(
        runsFromMidis([72, 71, 69, 67]),
        up,
      );
      expect(filledCount(slots)).toBeLessThanOrEqual(1);
      expect(slots.slice(1, 4).every((hz) => hz == null)).toBe(true);
    });

    it("ascending pitches during a descending exercise do not fill the descent", () => {
      const down = buildScaleExerciseMidis(60, "major", 1, "descending");
      const slots = matchDetectedRunsToExpected(
        runsFromMidis([60, 62, 64, 65]),
        down,
      );
      expect(filledCount(slots)).toBeLessThanOrEqual(1);
      expect(slots.slice(1, 4).every((hz) => hz == null)).toBe(true);
    });

    it("repeating the turnaround tonic does not double-count the peak", () => {
      const ascent = C_MAJOR.slice(0, 8);
      const slots = matchDetectedRunsToExpected(
        runsFromMidis([...ascent, 72]),
        C_MAJOR,
      );
      expect(slots[7]).not.toBeNull();
      expect(slots[8]).toBeNull();
      expect(filledCount(slots)).toBe(8);
    });

    it("extra notes after a complete scale are ignored", () => {
      const slots = matchDetectedRunsToExpected(
        runsFromMidis([...C_MAJOR, 62, 64, 66]),
        C_MAJOR,
      );
      expect(filledCount(slots)).toBe(C_MAJOR.length);
      expect(slots.every((hz) => hz != null)).toBe(true);
    });

    it("a later octave of the same pitch class does not jump to the upper tonic", () => {
      const slots = matchDetectedRunsToExpected(
        runsFromMidis([60, 62, 72]),
        C_MAJOR,
      );
      expect(filledExpectedLabels(slots, C_MAJOR)).toEqual(["C4", "D4"]);
      expect(slots[7]).toBeNull();
    });

    it("slightly sharp or flat notes still map to the intended degree", () => {
      const slots = matchDetectedRunsToExpected(
        [
          pitchRun(60, { cents: 40, t0: 0 }),
          pitchRun(62, { cents: -35, t0: 0.4 }),
        ],
        C_MAJOR,
      );
      expect(filledExpectedLabels(slots, C_MAJOR)).toEqual(["C4", "D4"]);
    });
  });

  describe("run segmentation", () => {
    it("very short accidental sounds are ignored", () => {
      const frames = framesFromHzTimeline([
        { hz: midiToHz(64), count: 1 },
        { hz: midiToHz(60), count: 8 },
        { hz: midiToHz(62), count: 8 },
      ]);
      const runs = collectStablePitchRuns(frames);
      expect(runs.map((r) => Math.round(hzToMidi(r.medianHz)))).toEqual([60, 62]);
      const analysis = analyzeScaleFromFrames(frames, C_MAJOR);
      expectExactDetected(analysis.notes, ["C4", "D4"]);
    });

    it("a brief neighbour-pitch fluctuation stays one note", () => {
      const frames = framesFromHzTimeline([
        { hz: midiToHz(60), count: 8 },
        { hz: midiToHz(61), count: 2 },
        { hz: midiToHz(60), count: 8 },
      ]);
      const runs = collectStablePitchRuns(frames);
      expect(runs).toHaveLength(1);
      const analysis = analyzeScaleFromFrames(frames, C_MAJOR);
      expectExactDetected(analysis.notes, ["C4"]);
    });

    it("a note that starts sharp then settles is still one detection", () => {
      const sharp = midiToHz(60) * Math.pow(2, 40 / 1200);
      const frames = framesFromHzTimeline([
        { hz: sharp, count: 3 },
        { hz: midiToHz(60), count: 10 },
        { hz: midiToHz(62), count: 8 },
      ]);
      const runs = collectStablePitchRuns(frames);
      expect(runs.length).toBeGreaterThanOrEqual(2);
      const analysis = analyzeScaleFromFrames(frames, C_MAJOR);
      expectExactDetected(analysis.notes, ["C4", "D4"]);
      expect(Math.abs(analysis.notes[0]!.centsDifference)).toBeLessThan(25);
    });

    it("two notes played very close together stay two detections", () => {
      const frames = framesFromHzTimeline(
        [
          { hz: midiToHz(60), count: 4 },
          { hz: midiToHz(62), count: 4 },
        ],
        0.04,
      );
      const analysis = analyzeScaleFromFrames(frames, C_MAJOR);
      expectExactDetected(analysis.notes, ["C4", "D4"]);
    });

    it("long sustained notes still map 1:1", () => {
      const frames = framesFromHzTimeline([
        { hz: midiToHz(60), count: 40 },
        { hz: midiToHz(62), count: 40 },
      ]);
      const analysis = analyzeScaleFromFrames(frames, C_MAJOR);
      expectExactDetected(analysis.notes, ["C4", "D4"]);
    });
  });

  describe("full audio pipeline", () => {
    it("C4 then D4 then silence does not invent the rest of C major", () => {
      const { mono, sampleRateHz } = synthMidiNotes([60, 62], {
        suffixSilenceSec: 1.2,
      });
      const r = analyzeScalePerformance({
        mono,
        sampleRateHz,
        expectedMidis: C_MAJOR,
      });
      expectExactDetected(r.notes, ["C4", "D4"]);
      expect(r.notes.map((n) => n.expectedNoteLabel).slice(2)).toEqual(
        C_MAJOR.slice(2).map((m) => formatNoteLabel(m)),
      );
    });

    it("only the first note is played", () => {
      const { mono, sampleRateHz } = synthMidiNotes([60], {
        suffixSilenceSec: 0.8,
      });
      const r = analyzeScalePerformance({
        mono,
        sampleRateHz,
        expectedMidis: C_MAJOR,
      });
      expectExactDetected(r.notes, ["C4"]);
    });

    it("only 3 notes are played", () => {
      const { mono, sampleRateHz } = synthMidiNotes([60, 62, 64]);
      const r = analyzeScalePerformance({
        mono,
        sampleRateHz,
        expectedMidis: C_MAJOR,
      });
      expectExactDetected(r.notes, ["C4", "D4", "E4"]);
    });

    it("half the scale (ascent only) does not fill the descent", () => {
      const half = C_MAJOR.slice(0, 8);
      const { mono, sampleRateHz } = synthMidiNotes(half);
      const r = analyzeScalePerformance({
        mono,
        sampleRateHz,
        expectedMidis: C_MAJOR,
      });
      expectExactDetected(
        r.notes,
        half.map((m) => formatNoteLabel(m)),
      );
    });

    it("the complete scale is played", () => {
      const { mono, sampleRateHz } = synthMidiNotes(C_MAJOR, {
        secondsPerNote: 0.38,
      });
      const r = analyzeScalePerformance({
        mono,
        sampleRateHz,
        expectedMidis: C_MAJOR,
      });
      expectExactDetected(
        r.notes,
        C_MAJOR.map((m) => formatNoteLabel(m)),
      );
      expect(r.notes.every((n) => n.intonationBucket === "in_tune")).toBe(true);
    });

    it("wrong order still detects the heard notes, not later scale degrees", () => {
      const { mono, sampleRateHz } = synthMidiNotes([62, 60]);
      const r = analyzeScalePerformance({
        mono,
        sampleRateHz,
        expectedMidis: C_MAJOR,
      });
      expect(listDetectedNoteLabels(r.notes).sort()).toEqual(["C4", "D4"]);
      expect(r.notes.slice(2).every((n) => n.missingData)).toBe(true);
    });

    it("one skipped degree stays missing", () => {
      const { mono, sampleRateHz } = synthMidiNotes([
        60, 62, 64, 65, 69, 71, 72,
      ]);
      const r = analyzeScalePerformance({
        mono,
        sampleRateHz,
        expectedMidis: C_MAJOR,
      });
      expect(r.notes[4]!.missingData).toBe(true);
      expectExactDetected(r.notes, [
        "C4",
        "D4",
        "E4",
        "F4",
        "A4",
        "B4",
        "C5",
      ]);
    });

    it("multiple skipped degrees stay missing", () => {
      const { mono, sampleRateHz } = synthMidiNotes([60, 64, 67]);
      const r = analyzeScalePerformance({
        mono,
        sampleRateHz,
        expectedMidis: C_MAJOR,
      });
      expectExactDetected(r.notes, ["C4", "E4", "G4"]);
    });

    it("the same note twice does not fill C5", () => {
      const { mono, sampleRateHz } = synthMidiNotes([60, 60]);
      const r = analyzeScalePerformance({
        mono,
        sampleRateHz,
        expectedMidis: C_MAJOR,
      });
      expectExactDetected(r.notes, ["C4"]);
    });

    it("a completely incorrect note gets no scale feedback", () => {
      const { mono, sampleRateHz } = synthMidiNotes([66]);
      const r = analyzeScalePerformance({
        mono,
        sampleRateHz,
        expectedMidis: C_MAJOR,
      });
      expectExactDetected(r.notes, []);
    });

    it("silence is recorded", () => {
      const r = analyzeScalePerformance({
        mono: silence(44100, 1.5),
        sampleRateHz: 44100,
        expectedMidis: C_MAJOR,
      });
      expectExactDetected(r.notes, []);
    });

    it("very short accidental sounds do not become notes", () => {
      const sampleRate = 44100;
      const mono = concatAudio([
        sine(midiToHz(64), sampleRate, 0.04),
        silence(sampleRate, 0.3),
        sine(midiToHz(60), sampleRate, 0.45),
        silence(sampleRate, 0.08),
        sine(midiToHz(62), sampleRate, 0.45),
      ]);
      const r = analyzeScalePerformance({
        mono,
        sampleRateHz: sampleRate,
        expectedMidis: C_MAJOR,
      });
      expectExactDetected(r.notes, ["C4", "D4"]);
    });

    it("background noise does not invent extra scale notes", () => {
      const { mono, sampleRateHz } = synthMidiNotes([60, 62]);
      const noisy = addWhiteNoise(mono, 0.04);
      const r = analyzeScalePerformance({
        mono: noisy,
        sampleRateHz,
        expectedMidis: C_MAJOR,
      });
      expectExactDetected(r.notes, ["C4", "D4"]);
    });

    it("two notes played very close together", () => {
      const { mono, sampleRateHz } = synthMidiNotes([60, 62], {
        secondsPerNote: 0.28,
        gapSec: 0,
      });
      const r = analyzeScalePerformance({
        mono,
        sampleRateHz,
        expectedMidis: C_MAJOR,
      });
      expectExactDetected(r.notes, ["C4", "D4"]);
    });

    it("long sustained notes", () => {
      const { mono, sampleRateHz } = synthMidiNotes([60, 62], {
        secondsPerNote: 1.4,
        gapSec: 0.08,
      });
      const r = analyzeScalePerformance({
        mono,
        sampleRateHz,
        expectedMidis: C_MAJOR,
      });
      expectExactDetected(r.notes, ["C4", "D4"]);
    });

    it("very short but real notes are still detected", () => {
      const { mono, sampleRateHz } = synthMidiNotes([60, 62, 64], {
        secondsPerNote: 0.22,
        gapSec: 0.04,
      });
      const r = analyzeScalePerformance({
        mono,
        sampleRateHz,
        expectedMidis: C_MAJOR,
      });
      expectExactDetected(r.notes, ["C4", "D4", "E4"]);
    });

    it("recording stops halfway through the scale", () => {
      const { mono, sampleRateHz } = synthMidiNotes(C_MAJOR.slice(0, 7));
      const r = analyzeScalePerformance({
        mono,
        sampleRateHz,
        expectedMidis: C_MAJOR,
      });
      expectExactDetected(r.notes, [
        "C4",
        "D4",
        "E4",
        "F4",
        "G4",
        "A4",
        "B4",
      ]);
    });

    it("long pauses between notes still match in order", () => {
      const { mono, sampleRateHz } = synthMidiNotes([60, 62, 64], {
        secondsPerNote: 0.4,
        gapSec: 1.4,
      });
      const r = analyzeScalePerformance({
        mono,
        sampleRateHz,
        expectedMidis: C_MAJOR,
      });
      expectExactDetected(r.notes, ["C4", "D4", "E4"]);
    });

    it("extremely slow notes still map 1:1", () => {
      const { mono, sampleRateHz } = synthMidiNotes([60, 62], {
        secondsPerNote: 2.2,
        gapSec: 0.3,
      });
      const r = analyzeScalePerformance({
        mono,
        sampleRateHz,
        expectedMidis: C_MAJOR,
      });
      expectExactDetected(r.notes, ["C4", "D4"]);
    });

    it("slightly sharp notes still count as the intended scale degrees", () => {
      const { mono, sampleRateHz } = synthMidiNotes([60, 62], {
        centsOffsets: [40, -38],
      });
      const r = analyzeScalePerformance({
        mono,
        sampleRateHz,
        expectedMidis: C_MAJOR,
      });
      expectExactDetected(r.notes, ["C4", "D4"]);
    });

    it("Bb major MIDI matches even when chromatic labels say A#", () => {
      const bb = buildScaleExerciseMidis(70, "major", 1, "ascending");
      const { mono, sampleRateHz } = synthMidiNotes(bb.slice(0, 3));
      const r = analyzeScalePerformance({
        mono,
        sampleRateHz,
        expectedMidis: bb,
      });
      expect(r.notes[0]!.expectedMidi).toBe(70);
      expect(r.notes[0]!.missingData).toBe(false);
      expect(r.summary.notesAnalyzed).toBe(3);
      expect(r.summary.notesMissing).toBe(bb.length - 3);
    });

    it("a note that starts flat then settles still matches once", () => {
      const sampleRate = 44100;
      const flatHz = midiToHz(60) * Math.pow(2, -35 / 1200);
      const mono = concatAudio([
        sine(flatHz, sampleRate, 0.12),
        sine(midiToHz(60), sampleRate, 0.4),
        silence(sampleRate, 0.08),
        sine(midiToHz(62), sampleRate, 0.45),
      ]);
      const r = analyzeScalePerformance({
        mono,
        sampleRateHz: sampleRate,
        expectedMidis: C_MAJOR,
      });
      expectExactDetected(r.notes, ["C4", "D4"]);
    });

    it("feedback is only present for detected notes", () => {
      const { mono, sampleRateHz } = synthMidiNotes([60, 62]);
      const r = analyzeScalePerformance({
        mono,
        sampleRateHz,
        expectedMidis: C_MAJOR,
      });
      for (const note of r.notes) {
        if (note.missingData) {
          expect(note.intonationBucket).toBe("unknown");
          expect(note.centsDifference).toBe(0);
          expect(note.detectedHz).toBe(0);
        } else {
          expect(note.intonationBucket).not.toBe("unknown");
          expect(note.detectedHz).toBeGreaterThan(0);
        }
      }
    });

    it("collectPitchFrames on silence yields no voiced frames", () => {
      const frames = collectPitchFrames(silence(44100, 1), 44100);
      expect(frames).toHaveLength(0);
    });
  });
});
