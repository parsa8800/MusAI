import { describe, expect, it } from "vitest";
import { DynamicsAnalyzer } from "@/features/piece-studio/feedback/analyzers/DynamicsAnalyzer";
import {
  findDynamicFindings,
  findHairpinFindings,
} from "@/features/piece-studio/feedback/analyzers/dynamicsTiming";
import { expectedNotesFromScore } from "@/features/piece-studio/score/expectedNotes";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";

const SR = 8000;

function tone(seconds: number, amp: number): Float32Array {
  const count = Math.floor(seconds * SR);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = amp * Math.sin((2 * Math.PI * 440 * i) / SR);
  }
  return out;
}

function join(parts: Float32Array[]): Float32Array {
  const count = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Float32Array(count);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const notes = [
  { noteIndex: 0, writtenDynamic: null, heardSec: 0, absoluteOnsetQuarters: 0 },
  { noteIndex: 1, writtenDynamic: null, heardSec: 0.5, absoluteOnsetQuarters: 1 },
];

describe("findHairpinFindings", () => {
  it("marks a crescendo that stays level or gets quieter", () => {
    const level = findHairpinFindings({
      hairpins: [
        {
          direction: "crescendo",
          noteIndex: 0,
          startQuarters: 0,
          endQuarters: 2,
        },
      ],
      notes,
      mono: tone(0.8, 0.2),
      sampleRateHz: SR,
    });
    expect(level.map((finding) => finding.kind)).toEqual(["unchanged"]);

    const reversed = findHairpinFindings({
      hairpins: [
        {
          direction: "crescendo",
          noteIndex: 0,
          startQuarters: 0,
          endQuarters: 2,
        },
      ],
      notes,
      mono: join([tone(0.4, 0.45), tone(0.4, 0.08)]),
      sampleRateHz: SR,
    });
    expect(reversed.map((finding) => finding.kind)).toEqual(["reversed"]);
  });

  it("leaves a crescendo that grows, and marks a decrescendo that grows", () => {
    const swell = join([tone(0.4, 0.08), tone(0.4, 0.45)]);
    const grown = findHairpinFindings({
      hairpins: [
        {
          direction: "crescendo",
          noteIndex: 0,
          startQuarters: 0,
          endQuarters: 2,
        },
      ],
      notes,
      mono: swell,
      sampleRateHz: SR,
    });
    expect(grown).toEqual([]);

    const louder = findHairpinFindings({
      hairpins: [
        {
          direction: "decrescendo",
          noteIndex: 0,
          startQuarters: 0,
          endQuarters: 2,
        },
      ],
      notes,
      mono: swell,
      sampleRateHz: SR,
    });
    expect(louder.map((finding) => finding.kind)).toEqual(["reversed"]);
  });

  it("marks a decrescendo that stays level", () => {
    const flat = findHairpinFindings({
      hairpins: [
        {
          direction: "decrescendo",
          noteIndex: 0,
          startQuarters: 0,
          endQuarters: 4,
        },
      ],
      notes: [
        { noteIndex: 0, writtenDynamic: "f", heardSec: 0, absoluteOnsetQuarters: 0 },
        { noteIndex: 1, writtenDynamic: "f", heardSec: 0.5, absoluteOnsetQuarters: 1 },
        { noteIndex: 2, writtenDynamic: "f", heardSec: 1, absoluteOnsetQuarters: 2 },
        { noteIndex: 3, writtenDynamic: "f", heardSec: 1.5, absoluteOnsetQuarters: 3 },
      ],
      mono: tone(2, 0.2),
      sampleRateHz: SR,
    });
    expect(flat.map((finding) => finding.kind)).toEqual(["unchanged"]);
  });

  it("leaves a decrescendo that fades even when one later note spikes", () => {
    const amps = [0.4, 0.32, 0.22, 0.5, 0.14, 0.1];
    const faded = findHairpinFindings({
      hairpins: [
        {
          direction: "decrescendo",
          noteIndex: 0,
          startQuarters: 0,
          endQuarters: 6,
        },
      ],
      notes: amps.map((_, index) => ({
        noteIndex: index,
        writtenDynamic: "f",
        heardSec: index * 0.45,
        absoluteOnsetQuarters: index,
      })),
      mono: join(amps.map((amp) => tone(0.45, amp))),
      sampleRateHz: SR,
    });
    expect(faded).toEqual([]);
  });
});

describe("findDynamicFindings", () => {
  function clock(marks: string[]) {
    return marks.map((mark, index) => ({
      noteIndex: index,
      writtenDynamic: mark,
      heardSec: index * 0.45,
      absoluteOnsetQuarters: index,
    }));
  }

  it("leaves a piano that is softer than the forte, even when the forte later fades", () => {
    const marks = ["p", "p", "p", "f", "f", "f", "f", "f", "f"];
    const amps = [0.1, 0.1, 0.11, 0.2, 0.2, 0.2, 0.08, 0.05, 0.04];
    const findings = findDynamicFindings({
      notes: clock(marks),
      mono: join(amps.map((amp) => tone(0.45, amp))),
      sampleRateHz: SR,
      hairpins: [
        {
          direction: "decrescendo",
          noteIndex: 6,
          startQuarters: 6,
          endQuarters: 9,
        },
      ],
    });
    expect(findings).toEqual([]);
  });

  it("marks a piano that is as loud as the forte", () => {
    const marks = ["p", "p", "p", "f", "f", "f", "ff", "ff"];
    const loud = 0.2;
    const amps = [loud, loud, loud, loud, loud, loud, loud * 1.6, loud * 1.6];
    const findings = findDynamicFindings({
      notes: clock(marks),
      mono: join(amps.map((amp) => tone(0.45, amp))),
      sampleRateHz: SR,
    });
    expect(findings?.map((finding) => [finding.noteIndex, finding.kind])).toEqual([
      [0, "too_loud"],
    ]);
  });
});

describe("DynamicsAnalyzer hairpins", () => {
  it("judges a hairpin when the piece has only one written letter", () => {
    const score = parseMusicXmlToScore(
      `<?xml version="1.0"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <direction><direction-type><wedge type="crescendo" number="1"/></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
    <measure number="2">
      <direction><direction-type><wedge type="stop" number="1"/></direction-type></direction>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`,
      "Hairpin",
    );
    const expected = expectedNotesFromScore(score);
    const mono = tone(2, 0.2);
    const times = expected.map((_, index) => index * 0.35);
    const report = DynamicsAnalyzer.analyze({
      pieceId: "hairpin",
      attemptId: "level",
      score,
      expectedNotes: expected,
      audio: { mono, sampleRateHz: SR, durationSec: mono.length / SR },
      pitchMatch: {
        slots: expected.map(() => 440),
        timesSec: times,
        attackSec: times,
        durationSec: mono.length / SR,
      },
    });
    expect(report.status).toBe("ready");
    expect(report.events.map((event) => event.explanation)).toEqual([
      "The crescendo stayed at one volume\nLet it grow",
    ]);
  });
});
