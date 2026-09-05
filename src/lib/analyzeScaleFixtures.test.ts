import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeScalePerformance } from "@/lib/analyzeScalePerformance";
import { buildExerciseScaleMidis } from "@/lib/scales";

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

const wavDir = path.resolve(process.cwd(), "musai audio/test-cmaj/wav");

describe("real violin C-major fixtures (when present)", () => {
  const uneven = path.join(wavDir, "cmaj1_uneven.wav");
  const hasFixtures = fs.existsSync(uneven);

  it.skipIf(!hasFixtures)(
    "edge takes against C4 root stay finite and measure most notes",
    () => {
      const expected = buildExerciseScaleMidis(60, "major", 1);
      const files = [
        "cmaj1_uneven.wav",
        "cmaj1_fast.wav",
        "cmaj1_skip.wav",
        "cmaj1_rustling.wav",
      ];
      for (const name of files) {
        const filePath = path.join(wavDir, name);
        if (!fs.existsSync(filePath)) continue;
        const { mono, sampleRate } = readWavMono(filePath);
        const r = analyzeScalePerformance({
          mono,
          sampleRateHz: sampleRate,
          expectedMidis: expected,
        });
        expect(r.notes).toHaveLength(expected.length);
        expect(r.summary.overallScore0to100).toBeGreaterThanOrEqual(0);
        expect(r.summary.overallScore0to100).toBeLessThanOrEqual(100);
        expect(Number.isFinite(r.summary.meanSignedCents)).toBe(true);
        // Edge takes should still produce readable pitch on most windows.
        expect(r.summary.notesAnalyzed).toBeGreaterThanOrEqual(
          Math.floor(expected.length * 0.5),
        );
      }
    },
  );

  it.skipIf(!hasFixtures)(
    "incomplete take leaves more unclear or poorly aligned steps",
    () => {
      const filePath = path.join(wavDir, "Halfway.wav");
      if (!fs.existsSync(filePath)) return;
      const expected = buildExerciseScaleMidis(60, "major", 1);
      const { mono, sampleRate } = readWavMono(filePath);
      const r = analyzeScalePerformance({
        mono,
        sampleRateHz: sampleRate,
        expectedMidis: expected,
      });
      expect(r.summary.inTunePercent).toBeLessThan(70);
      expect(r.summary.overallScore0to100).toBeLessThan(80);
    },
  );

  it.skipIf(!hasFixtures)(
    "2-octave fixture analyses against 2-octave C major without throwing",
    () => {
      const filePath = path.join(wavDir, "Cmaj_2_octaves.wav");
      if (!fs.existsSync(filePath)) return;
      const expected = buildExerciseScaleMidis(60, "major", 2);
      const { mono, sampleRate } = readWavMono(filePath);
      const r = analyzeScalePerformance({
        mono,
        sampleRateHz: sampleRate,
        expectedMidis: expected,
      });
      expect(r.notes).toHaveLength(expected.length);
      expect(r.summary.notesAnalyzed + r.summary.notesMissing).toBe(
        expected.length,
      );
      expect(r.summary.notesAnalyzed).toBeGreaterThan(0);
    },
  );
});
