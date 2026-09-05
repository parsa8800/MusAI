/**
 * Phase 0.2 fixture check: detect scale from audio (same path as Scale Studio import),
 * then report whether results match the intended story for each take.
 *
 *   npx tsx scripts/generate-synth-fixtures.ts   # if synth/*.wav missing
 *   npx tsx scripts/phase02-fixture-check.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectScaleFromAudio } from "../src/lib/detectScale";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wavDir = path.join(root, "musai audio/test-cmaj/wav");

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

type Expectation = {
  /** Path relative to musai audio/test-cmaj/wav/ */
  rel: string;
  story: string;
  expectTonicPc?: number;
  expectKind?: "major" | "natural_minor";
  expectSpan?: 1 | 2;
  expectDetectOk: boolean;
  scoreAtLeast?: number;
  scoreAtMost?: number;
  missingAtLeast?: number;
  rootMidiNear?: number;
};

const cases: Expectation[] = [
  {
    rel: "synth/cmaj1_clean.wav",
    story: "Clean synthetic C major 1 octave — high score",
    expectTonicPc: 0,
    expectKind: "major",
    expectSpan: 1,
    expectDetectOk: true,
    scoreAtLeast: 85,
    rootMidiNear: 60,
  },
  {
    rel: "synth/cmaj1_sharp_e.wav",
    story: "C major with sharp E — still C major, not perfect",
    expectTonicPc: 0,
    expectKind: "major",
    expectSpan: 1,
    expectDetectOk: true,
    scoreAtLeast: 50,
    scoreAtMost: 99,
    rootMidiNear: 60,
  },
  {
    rel: "synth/gmaj1_clean.wav",
    story: "Clean G major 1 octave — tonic G, not C",
    expectTonicPc: 7,
    expectKind: "major",
    expectSpan: 1,
    expectDetectOk: true,
    scoreAtLeast: 85,
    rootMidiNear: 67,
  },
  {
    rel: "synth/note_a4_only.wav",
    story: "Single A4 — must not pretend it is a full scale",
    expectDetectOk: false,
  },
  {
    rel: "cmaj1_uneven.wav",
    story: "Uneven C major 1 octave — still C major, readable take",
    expectTonicPc: 0,
    expectKind: "major",
    expectSpan: 1,
    expectDetectOk: true,
    scoreAtLeast: 40,
    rootMidiNear: 60,
  },
  {
    rel: "cmaj1_fast.wav",
    story: "Rushed C major 1 octave — still C major; score may be lower",
    expectTonicPc: 0,
    expectKind: "major",
    expectSpan: 1,
    expectDetectOk: true,
    scoreAtLeast: 25,
    rootMidiNear: 60,
  },
  {
    rel: "cmaj1_skip.wav",
    story: "Skipped note — C major 1 oct; may have missing/weak notes",
    expectTonicPc: 0,
    expectKind: "major",
    expectSpan: 1,
    expectDetectOk: true,
    scoreAtLeast: 25,
    rootMidiNear: 60,
  },
  {
    rel: "cmaj1_rustling.wav",
    story: "Noisy/unclear — C major if possible, or fail/ask confirm",
    expectTonicPc: 0,
    expectKind: "major",
    expectSpan: 1,
    expectDetectOk: true,
    scoreAtLeast: 15,
    rootMidiNear: 60,
  },
  {
    rel: "Halfway.wav",
    story: "Incomplete scale — not a perfect full take",
    expectTonicPc: 0,
    expectKind: "major",
    expectSpan: 1,
    expectDetectOk: true,
    scoreAtMost: 80,
    rootMidiNear: 60,
  },
  {
    rel: "Cmaj_2_octaves.wav",
    story: "Full 2-octave C major",
    expectTonicPc: 0,
    expectKind: "major",
    expectSpan: 2,
    expectDetectOk: true,
    scoreAtLeast: 40,
    rootMidiNear: 60,
  },
];

type Row = {
  file: string;
  story: string;
  pass: boolean;
  issues: string[];
  detail: string;
};

const rows: Row[] = [];

for (const c of cases) {
  const filePath = path.join(wavDir, c.rel);
  const issues: string[] = [];
  if (!fs.existsSync(filePath)) {
    rows.push({
      file: c.rel,
      story: c.story,
      pass: false,
      issues: ["file missing — run: npx tsx scripts/generate-synth-fixtures.ts"],
      detail: "—",
    });
    continue;
  }

  const { mono, sampleRate } = readWavMono(filePath);
  const detected = detectScaleFromAudio(mono, sampleRate);

  if (!detected.ok) {
    if (c.expectDetectOk) {
      issues.push(`detect failed (${detected.reason}) — app should ask to confirm`);
    }
    rows.push({
      file: c.rel,
      story: c.story,
      pass: issues.length === 0,
      issues:
        issues.length > 0
          ? issues
          : ["detect failed as expected (not a scale)"],
      detail: `ok=false reason=${detected.reason}`,
    });
    continue;
  }

  if (!c.expectDetectOk) {
    issues.push(
      `detect succeeded as ${detected.best.scaleLabel} (expected no_match)`,
    );
  }

  const b = detected.best;
  const s = b.analysis.summary;
  const detail = [
    `${b.scaleLabel}`,
    `${b.octaveSpan}oct`,
    `root=${b.rootMidi}`,
    `score=${s.overallScore0to100}`,
    `inTune=${s.inTunePercent}%`,
    `missing=${s.notesMissing}`,
    `analyzed=${s.notesAnalyzed}`,
    detected.ambiguous ? "ambiguous" : "clear",
  ].join(" · ");

  if (c.expectTonicPc !== undefined && b.tonicPitchClass !== c.expectTonicPc) {
    issues.push(`tonic ${b.tonicPitchClass} (want ${c.expectTonicPc})`);
  }
  if (c.expectKind && b.scaleKind !== c.expectKind) {
    issues.push(`kind ${b.scaleKind} (want ${c.expectKind})`);
  }
  if (c.expectSpan && b.octaveSpan !== c.expectSpan) {
    issues.push(`span ${b.octaveSpan} (want ${c.expectSpan})`);
  }
  if (c.rootMidiNear !== undefined && Math.abs(b.rootMidi - c.rootMidiNear) > 14) {
    issues.push(`rootMidi ${b.rootMidi} far from ~${c.rootMidiNear}`);
  }
  if (c.scoreAtLeast !== undefined && s.overallScore0to100 < c.scoreAtLeast) {
    issues.push(`score ${s.overallScore0to100} < ${c.scoreAtLeast}`);
  }
  if (c.scoreAtMost !== undefined && s.overallScore0to100 > c.scoreAtMost) {
    issues.push(`score ${s.overallScore0to100} > ${c.scoreAtMost}`);
  }
  if (c.missingAtLeast !== undefined && s.notesMissing < c.missingAtLeast) {
    issues.push(`missing ${s.notesMissing} < ${c.missingAtLeast}`);
  }

  rows.push({
    file: c.rel,
    story: c.story,
    pass: issues.length === 0,
    issues,
    detail,
  });
}

console.log("\n=== Phase 0.2 fixture check (detectScaleFromAudio) ===\n");
let passCount = 0;
for (const r of rows) {
  const mark = r.pass ? "PASS" : "FAIL";
  if (r.pass) passCount++;
  console.log(`${mark}  ${r.file}`);
  console.log(`      story: ${r.story}`);
  console.log(`      got:   ${r.detail}`);
  if (r.issues.length) {
    console.log(`      issues:${r.issues.map((i) => ` ${i}`).join(";")}`);
  }
  console.log("");
}
console.log(`Result: ${passCount}/${rows.length} passed\n`);

if (passCount < rows.length) {
  process.exitCode = 1;
}
