import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectScaleFromAudio } from "@/lib/detectScale";

function readWavMono(filePath: string): { mono: Float32Array; sampleRate: number } {
  const buf = fs.readFileSync(filePath);
  const numChannels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
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

/** Converted from `musai audio/C major Scale.m4a` for regression. */
const userPath = path.resolve(
  process.cwd(),
  "musai audio/test-cmaj/wav/C_major_Scale_user.wav",
);

describe("user C major Scale recording", () => {
  it.skipIf(!fs.existsSync(userPath))("detects as C major", () => {
    const { mono, sampleRate } = readWavMono(userPath);
    const detected = detectScaleFromAudio(mono, sampleRate);
    expect(detected.ok).toBe(true);
    if (!detected.ok) return;
    expect(detected.best.tonicPitchClass).toBe(0);
    expect(detected.best.scaleKind).toBe("major");
  });
});
