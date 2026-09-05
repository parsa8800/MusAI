/**
 * Thin CLI wrapper around the real scale analyser (keeps script in sync with app).
 *
 * Usage:
 *   npx tsx scripts/analyze-test-recordings.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeScalePerformance } from "../src/lib/analyzeScalePerformance";
import { buildExerciseScaleMidis } from "../src/lib/scales";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wavDir = path.join(root, "musai audio/test-cmaj/wav");
const ROOT_MIDI = 60; // C4 — matches app defaultRootMidiForTonic(0)

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
    throw new Error(`Unsupported bits: ${bitsPerSample}`);
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

const files: Array<{ name: string; span: 1 | 2 }> = [
  { name: "cmaj1_uneven.wav", span: 1 },
  { name: "cmaj1_fast.wav", span: 1 },
  { name: "Halfway.wav", span: 1 },
  { name: "cmaj1_skip.wav", span: 1 },
  { name: "cmaj1_rustling.wav", span: 1 },
  { name: "Cmaj_2_octaves.wav", span: 2 },
];

for (const file of files) {
  const filePath = path.join(wavDir, file.name);
  if (!fs.existsSync(filePath)) {
    console.log(`skip missing ${file.name}`);
    continue;
  }
  const { mono, sampleRate } = readWavMono(filePath);
  const expected = buildExerciseScaleMidis(ROOT_MIDI, "major", file.span);
  const r = analyzeScalePerformance({
    mono,
    sampleRateHz: sampleRate,
    expectedMidis: expected,
  });
  const s = r.summary;
  console.log(
    `\n==== ${file.name} (${file.span} oct, C4, ${expected.length} notes) ====`,
  );
  console.log(
    `score=${s.overallScore0to100} inTune=${s.inTunePercent}% meanCents=${s.meanSignedCents} missing=${s.notesMissing} analyzed=${s.notesAnalyzed}`,
  );
  const worst = [...r.notes]
    .filter((n) => !n.missingData)
    .sort(
      (a, b) => Math.abs(b.centsDifference) - Math.abs(a.centsDifference),
    )
    .slice(0, 5)
    .map(
      (n) =>
        `${n.expectedNoteLabel}:${n.centsDifference}¢(${n.intonationBucket})`,
    )
    .join(" | ");
  console.log("worst:", worst || "(none)");
}
