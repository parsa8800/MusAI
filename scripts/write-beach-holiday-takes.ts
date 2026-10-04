/**
 * Write the Beach Holiday rhythm and dynamics test takes as wav files.
 *
 *   npx tsx scripts/write-beach-holiday-takes.ts
 */
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import { synthesizeBeachTake } from "../src/features/piece-studio/feedback/beachHolidayTakeAudio";
import { BEACH_HOLIDAY_XML } from "../src/features/piece-studio/score/beachHolidayFixture";
import { expectedNotesFromScore } from "../src/features/piece-studio/score/expectedNotes";
import { parseMusicXmlToScore } from "../src/features/piece-studio/score/parseMusicXml";

const dom = new JSDOM("");
globalThis.DOMParser = dom.window.DOMParser;

const outDir = path.join(
  process.env.HOME ?? "",
  "Desktop",
  "Beach Holiday test takes",
);

const score = parseMusicXmlToScore(BEACH_HOLIDAY_XML, "Beach Holiday");
const notes = expectedNotesFromScore(score);
const BEAT = 0.7;
const P = 0.15;
const F = P * 10 ** (12 / 20);
const FF = P * 10 ** (16 / 20);

function amp(level: { p: number; f: number; ff: number }) {
  return (note: (typeof notes)[number]) => {
    if (note.writtenDynamic === "ff") return level.ff;
    if (note.writtenDynamic === "f") return level.f;
    return level.p;
  };
}

function writeWav(filePath: string, mono: Float32Array, sampleRate: number) {
  const dataSize = mono.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < mono.length; i++) {
    const sample = Math.max(-1, Math.min(1, mono[i]!));
    buf.writeInt16LE(sample < 0 ? sample * 0x8000 : sample * 0x7fff, 44 + i * 2);
  }
  fs.writeFileSync(filePath, buf);
}

const takes: Array<{
  name: string;
  input: Omit<Parameters<typeof synthesizeBeachTake>[0], "notes">;
}> = [
  { name: "01-rhythm-even-wobble.wav", input: { secPerQuarter: BEAT, wobbleSec: 0.02 } },
  {
    name: "02-rhythm-held-long-and-one-early.wav",
    input: {
      secPerQuarter: BEAT,
      gapEdits: [
        { afterNoteIndex: 0, extraSec: BEAT },
        { afterNoteIndex: 17, extraSec: -0.2 },
      ],
    },
  },
  {
    name: "03-rhythm-one-note-late.wav",
    input: { secPerQuarter: BEAT, gapEdits: [{ afterNoteIndex: 2, extraSec: 0.2 }] },
  },
  {
    name: "04-rhythm-one-note-cut-short.wav",
    input: { secPerQuarter: BEAT, gapEdits: [{ afterNoteIndex: 2, extraSec: -0.32 }] },
  },
  { name: "05-rhythm-steadily-slower.wav", input: { secPerQuarter: 1.15 } },
  { name: "06-rhythm-missed-note.wav", input: { secPerQuarter: BEAT, omit: [2] } },
  {
    name: "07-dynamics-follows-marks.wav",
    input: { secPerQuarter: BEAT, amplitudeFor: amp({ p: P * 1.12, f: F, ff: FF * 0.9 }) },
  },
  {
    name: "08-dynamics-soft-too-loud.wav",
    input: { secPerQuarter: BEAT, amplitudeFor: amp({ p: F, f: F, ff: FF }) },
  },
  {
    name: "09-dynamics-very-loud-too-soft.wav",
    input: { secPerQuarter: BEAT, amplitudeFor: amp({ p: P, f: F, ff: F }) },
  },
  {
    name: "10-dynamics-loud-too-soft.wav",
    input: { secPerQuarter: BEAT, amplitudeFor: amp({ p: P, f: P, ff: FF }) },
  },
];

fs.mkdirSync(outDir, { recursive: true });
for (const take of takes) {
  const audio = synthesizeBeachTake({ notes, ...take.input });
  const filePath = path.join(outDir, take.name);
  writeWav(filePath, audio.mono, audio.sampleRateHz);
  console.log(filePath);
}
