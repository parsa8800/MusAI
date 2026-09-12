import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeScalePerformance } from "@/lib/analyzeScalePerformance";
import { detectScaleFromAudio } from "@/lib/detectScale";
import { midiToHz } from "@/lib/intonation";
import { buildExerciseScaleMidis } from "@/lib/scales";

function synthScaleMono(
  midis: readonly number[],
  opts?: { sampleRate?: number; secondsPerNote?: number },
): { mono: Float32Array; sampleRateHz: number } {
  const sampleRate = opts?.sampleRate ?? 44100;
  const secondsPerNote = opts?.secondsPerNote ?? 0.4;
  const nPer = Math.floor(sampleRate * secondsPerNote);
  const mono = new Float32Array(nPer * midis.length);
  for (let i = 0; i < midis.length; i++) {
    const hz = midiToHz(midis[i]!);
    const start = i * nPer;
    for (let s = 0; s < nPer; s++) {
      mono[start + s] = Math.sin((2 * Math.PI * hz * s) / sampleRate) * 0.85;
    }
  }
  return { mono, sampleRateHz: sampleRate };
}

function readWavMono(filePath: string): { mono: Float32Array; sampleRate: number } {
  const buf = fs.readFileSync(filePath);
  const numChannels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);
  let dataOffset = 12;
  while (dataOffset < buf.length) {
    const id = buf.toString("ascii", dataOffset, dataOffset + 4);
    const size = buf.readUInt32LE(dataOffset + 4);
    if (id === "data") {
      dataOffset += 8;
      break;
    }
    dataOffset += 8 + size;
  }
  if (bitsPerSample !== 16) {
    throw new Error(`Unsupported bitsPerSample: ${bitsPerSample}`);
  }
  const sampleCount = Math.floor((buf.length - dataOffset) / 2 / numChannels);
  const mono = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    let sum = 0;
    for (let c = 0; c < numChannels; c++) {
      sum += buf.readInt16LE(dataOffset + (i * numChannels + c) * 2) / 32768;
    }
    mono[i] = sum / numChannels;
  }
  return { mono, sampleRate };
}

describe("detectScaleFromAudio", () => {
  it("detects a synthesised C major 1-octave round trip", () => {
    const expected = buildExerciseScaleMidis(60, "major", 1);
    const { mono, sampleRateHz } = synthScaleMono(expected);
    const detected = detectScaleFromAudio(mono, sampleRateHz);
    expect(detected.ok).toBe(true);
    if (!detected.ok) return;
    expect(detected.best.tonicPitchClass).toBe(0);
    expect(detected.best.scaleKind).toBe("major");
    expect(detected.best.octaveSpan).toBe(1);
    expect(detected.best.rootMidi).toBe(60);
    expect(detected.best.expectedMidis[0]).toBe(60);
  });

  it("still scores an explicit expected sequence highly", () => {
    const expected = buildExerciseScaleMidis(60, "major", 1);
    const { mono, sampleRateHz } = synthScaleMono(expected);
    const analysis = analyzeScalePerformance({
      mono,
      sampleRateHz,
      expectedMidis: expected,
    });
    expect(analysis.summary.notesAnalyzed).toBeGreaterThan(10);
    expect(analysis.summary.overallScore0to100).toBeGreaterThanOrEqual(90);
  });

  const halfwayPath = path.resolve(
    process.cwd(),
    "musai audio/test-cmaj/wav/Halfway.wav",
  );

  it.skipIf(!fs.existsSync(halfwayPath))(
    "incomplete Halfway take stays C major round-trip, not a perfect short ascent",
    () => {
      const { mono, sampleRate } = readWavMono(halfwayPath);
      const detected = detectScaleFromAudio(mono, sampleRate);
      expect(detected.ok).toBe(true);
      if (!detected.ok) return;
      expect(detected.best.tonicPitchClass).toBe(0);
      expect(detected.best.scaleKind).toBe("major");
      expect(detected.best.octaveSpan).toBe(1);
      expect(detected.best.pattern).toBe("round_trip");
      expect(detected.best.analysis.summary.notesMissing).toBeGreaterThan(0);
      expect(detected.best.analysis.summary.notesAnalyzed).toBeLessThan(
        detected.best.expectedMidis.length,
      );
    },
  );

  const synthDir = path.resolve(process.cwd(), "musai audio/test-cmaj/wav/synth");
  const cleanPath = path.join(synthDir, "cmaj1_clean.wav");
  const notePath = path.join(synthDir, "note_a4_only.wav");
  const gPath = path.join(synthDir, "gmaj1_clean.wav");

  it.skipIf(!fs.existsSync(cleanPath))(
    "synthetic clean C major detects as C major 1 octave with high score",
    () => {
      const { mono, sampleRate } = readWavMono(cleanPath);
      const detected = detectScaleFromAudio(mono, sampleRate);
      expect(detected.ok).toBe(true);
      if (!detected.ok) return;
      expect(detected.best.tonicPitchClass).toBe(0);
      expect(detected.best.scaleKind).toBe("major");
      expect(detected.best.octaveSpan).toBe(1);
      expect(detected.best.rootMidi).toBe(60);
      expect(detected.best.analysis.summary.overallScore0to100).toBeGreaterThanOrEqual(
        85,
      );
    },
  );

  it.skipIf(!fs.existsSync(gPath))(
    "synthetic clean G major detects as G major, not C",
    () => {
      const { mono, sampleRate } = readWavMono(gPath);
      const detected = detectScaleFromAudio(mono, sampleRate);
      expect(detected.ok).toBe(true);
      if (!detected.ok) return;
      expect(detected.best.tonicPitchClass).toBe(7);
      expect(detected.best.scaleKind).toBe("major");
    },
  );

  it.skipIf(!fs.existsSync(notePath))(
    "single-note A4 does not detect as a scale",
    () => {
      const { mono, sampleRate } = readWavMono(notePath);
      const detected = detectScaleFromAudio(mono, sampleRate);
      expect(detected.ok).toBe(false);
    },
  );
});
