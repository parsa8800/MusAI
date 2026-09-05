/**
 * Generate synthetic Phase 0.2 fixtures (clean / single-note / out-of-tune).
 *
 *   npx tsx scripts/generate-synth-fixtures.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { midiToHz } from "../src/lib/intonation";
import { buildExerciseScaleMidis } from "../src/lib/scales";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "musai audio/test-cmaj/wav/synth");
const SAMPLE_RATE = 44100;

function writeWavMono(filePath: string, mono: Float32Array, sampleRate: number) {
  const dataSize = mono.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < mono.length; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]!));
    buf.writeInt16LE((s * 32767) | 0, 44 + i * 2);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buf);
}

function synthNotes(
  midis: readonly number[],
  opts?: { secondsPerNote?: number; centsOffsets?: readonly number[] },
): Float32Array {
  const secondsPerNote = opts?.secondsPerNote ?? 0.35;
  const nPer = Math.floor(SAMPLE_RATE * secondsPerNote);
  const mono = new Float32Array(nPer * midis.length);
  for (let i = 0; i < midis.length; i++) {
    const cents = opts?.centsOffsets?.[i] ?? 0;
    const hz = midiToHz(midis[i]!) * Math.pow(2, cents / 1200);
    const start = i * nPer;
    for (let s = 0; s < nPer; s++) {
      const env =
        s < nPer * 0.05
          ? s / (nPer * 0.05)
          : s > nPer * 0.9
            ? (nPer - s) / (nPer * 0.1)
            : 1;
      mono[start + s] =
        Math.sin((2 * Math.PI * hz * s) / SAMPLE_RATE) * 0.75 * env;
    }
  }
  return mono;
}

fs.mkdirSync(outDir, { recursive: true });

const clean = buildExerciseScaleMidis(60, "major", 1);
writeWavMono(
  path.join(outDir, "cmaj1_clean.wav"),
  synthNotes(clean),
  SAMPLE_RATE,
);

const sharpE = clean.map((m, i) => m);
const cents = clean.map((m) => (m === 64 ? 45 : 0)); // E4 sharp
writeWavMono(
  path.join(outDir, "cmaj1_sharp_e.wav"),
  synthNotes(sharpE, { centsOffsets: cents }),
  SAMPLE_RATE,
);

writeWavMono(
  path.join(outDir, "note_a4_only.wav"),
  synthNotes([69], { secondsPerNote: 1.2 }),
  SAMPLE_RATE,
);

const gMajor = buildExerciseScaleMidis(67, "major", 1); // G4
writeWavMono(
  path.join(outDir, "gmaj1_clean.wav"),
  synthNotes(gMajor),
  SAMPLE_RATE,
);

console.log(`Wrote synth fixtures to ${outDir}`);
for (const name of fs.readdirSync(outDir).sort()) {
  console.log(`  ${name}`);
}
