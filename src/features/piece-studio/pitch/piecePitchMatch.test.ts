import { describe, expect, it } from "vitest";
import {
  matchPieceRunsDetailed,
  refineRepeatedPitchSlots,
  shareSustainedSamePitch,
} from "@/features/piece-studio/pitch/piecePitchMatch";
import type { StablePitchRun } from "@/lib/analyzePitch";
import { midiToHz } from "@/lib/intonation";

function run(midi: number, start: number, sec: number): StablePitchRun {
  const hz = midiToHz(midi);
  return {
    hz: [hz],
    midiCenter: midi,
    medianHz: hz,
    frameCount: 10,
    timeStartSec: start,
    timeEndSec: start + sec,
  };
}

describe("shareSustainedSamePitch", () => {
  it("paints both eighths when one bow holds the repeated pitch", () => {
    const pair = run(67, 0.9, 0.78);
    const after = run(66, 1.7, 0.8);
    const slots = shareSustainedSamePitch({
      expectedMidis: [67, 67, 66],
      durationQuarters: [0.5, 0.5, 1],
      slots: [
        { hz: pair.medianHz, run: pair },
        null,
        { hz: after.medianHz, run: after },
      ],
    });
    expect(slots[0]?.run).toBe(pair);
    expect(slots[1]?.run).toBe(pair);
    expect(slots[2]?.run).toBe(after);
  });

  it("leaves the second eighth empty when the bow was only one note long", () => {
    const pair = run(67, 0, 0.35);
    const after = run(66, 0.5, 0.8);
    const slots = shareSustainedSamePitch({
      expectedMidis: [67, 67, 66],
      durationQuarters: [0.5, 0.5, 1],
      slots: [
        { hz: pair.medianHz, run: pair },
        null,
        { hz: after.medianHz, run: after },
      ],
    });
    expect(slots[1]).toBeNull();
  });

  it("covers only the repeats one bow actually holds when the same pitch continues", () => {
    const firstBow = run(67, 0, 0.78);
    const secondBow = run(67, 1.2, 0.78);
    const after = run(66, 2.2, 0.8);
    const slots = shareSustainedSamePitch({
      expectedMidis: [67, 67, 67, 67, 66],
      durationQuarters: [0.5, 0.5, 0.5, 0.5, 1],
      slots: [
        { hz: firstBow.medianHz, run: firstBow },
        null,
        { hz: secondBow.medianHz, run: secondBow },
        null,
        { hz: after.medianHz, run: after },
      ],
    });
    expect(slots[0]?.run).toBe(firstBow);
    expect(slots[1]?.run).toBe(firstBow);
    expect(slots[2]?.run).toBe(secondBow);
    expect(slots[3]?.run).toBe(secondBow);
    expect(slots[4]?.run).toBe(after);
  });

  it("leaves a later repeat empty when the bow stops after two notes", () => {
    const bow = run(67, 0, 0.78);
    const after = run(66, 1.6, 0.8);
    const slots = shareSustainedSamePitch({
      expectedMidis: [67, 67, 67, 66],
      durationQuarters: [0.5, 0.5, 0.5, 1],
      slots: [
        { hz: bow.medianHz, run: bow },
        null,
        null,
        { hz: after.medianHz, run: after },
      ],
    });
    expect(slots[1]?.run).toBe(bow);
    expect(slots[2]).toBeNull();
    expect(slots[3]?.run).toBe(after);
  });

  it("keeps an ending that rings past the written length", () => {
    const pulse = run(64, 0, 0.8);
    const ending = run(55, 1, 3.2);
    const slots = shareSustainedSamePitch({
      expectedMidis: [64, 55, 55, 55],
      durationQuarters: [1, 0.5, 0.5, 1],
      slots: [
        { hz: pulse.medianHz, run: pulse },
        { hz: ending.medianHz, run: ending },
        null,
        null,
      ],
    });
    expect(slots[1]?.run).toBe(ending);
    expect(slots[2]?.run).toBe(ending);
    expect(slots[3]?.run).toBe(ending);
  });

  it("leaves the second note unheard when the bow only gets louder", () => {
    const pair = run(67, 0.9, 0.78);
    const after = run(66, 1.7, 0.8);
    const sampleRate = 48000;
    const mono = new Float32Array(sampleRate * 3);
    const fill = (t0: number, t1: number, amp: number) => {
      const a = Math.floor(t0 * sampleRate);
      const b = Math.floor(t1 * sampleRate);
      for (let i = a; i < b; i++) mono[i] = amp;
    };
    fill(1.02, 1.16, 0.08);
    fill(1.16, 1.3, 0.12);
    fill(1.3, 1.46, 0.22);
    fill(1.46, 1.7, 0.4);
    const slots = shareSustainedSamePitch({
      expectedMidis: [67, 67, 66],
      durationQuarters: [0.5, 0.5, 1],
      slots: [
        { hz: pair.medianHz, run: pair },
        null,
        { hz: after.medianHz, run: after },
      ],
      mono,
      sampleRateHz: sampleRate,
    });
    expect(slots[0]?.run).toBe(pair);
    expect(slots[1]).toBeNull();
  });
});

describe("refineRepeatedPitchSlots", () => {
  it("moves a nearby pitch off a repeated note onto the notes that follow", () => {
    const d = run(74, 0, 0.8);
    const csharp = run(73, 0.8, 0.78);
    csharp.medianHz = midiToHz(73) * 2 ** (16 / 1200);
    csharp.hz = [csharp.medianHz];
    const b = run(71, 1.6, 0.8);
    const slots = refineRepeatedPitchSlots({
      expectedMidis: [74, 74, 73, 73, 71],
      durationQuarters: [0.5, 0.5, 0.5, 0.5, 1],
      runs: [d, csharp, b],
      slots: [
        { hz: d.medianHz, run: d },
        { hz: csharp.medianHz, run: csharp },
        null,
        null,
        { hz: b.medianHz, run: b },
      ],
    });
    expect(slots.map((slot) => slot?.run)).toEqual([d, d, csharp, csharp, b]);
  });

  it("keeps a second bow when that note is already the written pitch", () => {
    const first = run(74, 0, 0.9);
    const second = run(74, 0.9, 0.4);
    const after = run(71, 1.4, 0.8);
    const slots = refineRepeatedPitchSlots({
      expectedMidis: [74, 74, 71],
      durationQuarters: [0.5, 0.5, 1],
      runs: [first, second, after],
      slots: [
        { hz: first.medianHz, run: first },
        { hz: second.medianHz, run: second },
        { hz: after.medianHz, run: after },
      ],
    });
    expect(slots[0]?.run).toBe(first);
    expect(slots[1]?.run).toBe(second);
    expect(slots[2]?.run).toBe(after);
  });

  it("keeps a separate ending note when a long bow already covered the repeats", () => {
    const pulse = run(66, 0, 0.64);
    const held = run(55, 0.7, 1.07);
    const ending = run(55, 2.05, 0.3);
    const slots = refineRepeatedPitchSlots({
      expectedMidis: [66, 55, 55, 55],
      durationQuarters: [1, 0.5, 0.5, 1],
      runs: [pulse, held, ending],
      slots: [
        { hz: pulse.medianHz, run: pulse },
        { hz: held.medianHz, run: held },
        { hz: ending.medianHz, run: ending },
        null,
      ],
    });
    expect(slots[1]?.run).toBe(held);
    expect(slots[2]?.run).toBe(held);
    expect(slots[3]?.run).toBe(ending);
  });

  it("leaves a missing final note empty when the second bow is the repeat", () => {
    const pulse = run(66, 0, 0.6);
    const first = run(55, 0.7, 0.64);
    const second = run(55, 1.55, 0.38);
    const slots = refineRepeatedPitchSlots({
      expectedMidis: [66, 55, 55, 55],
      durationQuarters: [1, 0.5, 0.5, 1],
      runs: [pulse, first, second],
      slots: [
        { hz: pulse.medianHz, run: pulse },
        { hz: first.medianHz, run: first },
        { hz: second.medianHz, run: second },
        null,
      ],
    });
    expect(slots[1]?.run).toBe(first);
    expect(slots[2]?.run).toBe(second);
    expect(slots[3]).toBeNull();
  });
});

describe("matchPieceRunsDetailed", () => {
  it("leaves a skipped note empty instead of taking the next pitch", () => {
    const csharp = run(73, 0, 0.7);
    const b = run(71, 0.8, 0.7);
    const slots = matchPieceRunsDetailed([csharp, b], [74, 73, 71]);
    expect(slots[0]).toBeNull();
    expect(slots[1]?.run).toBe(csharp);
    expect(slots[2]?.run).toBe(b);
  });

  it("keeps a very flat note on the written pitch", () => {
    const flatE = run(64, 0, 0.7);
    flatE.medianHz = midiToHz(64) * 2 ** (-81 / 1200);
    flatE.hz = [flatE.medianHz];
    const fs = run(66, 0.8, 0.7);
    const slots = matchPieceRunsDetailed([flatE, fs], [64, 66]);
    expect(slots[0]?.run).toBe(flatE);
    expect(slots[1]?.run).toBe(fs);
  });

  it("does not paint a bar that was played an octave higher", () => {
    const highs = [79, 78, 76, 78].map((midi, i) => run(midi, i * 0.7, 0.65));
    const back = run(67, 3, 0.7);
    const slots = matchPieceRunsDetailed(
      [...highs, back],
      [67, 67, 66, 66, 64, 66, 67],
    );
    expect(slots.slice(0, 6).every((slot) => slot == null)).toBe(true);
    expect(slots[6]?.run).toBe(back);
  });

  it("still hears one note when the tracker locked onto its harmonic", () => {
    const before = run(73, 0, 0.6);
    const harmonic = run(83, 0.7, 0.6);
    const after = run(73, 1.4, 0.6);
    const slots = matchPieceRunsDetailed(
      [before, harmonic, after],
      [73, 71, 73],
    );
    expect(slots[0]?.run).toBe(before);
    expect(slots[1]?.run).toBe(harmonic);
    expect(slots[1]?.hz).toBeCloseTo(harmonic.medianHz / 2, 5);
    expect(slots[2]?.run).toBe(after);
  });

  it("ignores a tiny flicker instead of skipping the note in between", () => {
    const csharp = run(73, 0, 0.6);
    const flicker = run(73, 0.7, 0.12);
    const b = run(71, 0.9, 0.6);
    const after = run(73, 1.6, 0.6);
    const slots = matchPieceRunsDetailed(
      [csharp, flicker, b, after],
      [73, 71, 73],
    );
    expect(slots[0]?.run).toBe(csharp);
    expect(slots[1]?.run).toBe(b);
    expect(slots[2]?.run).toBe(after);
  });

  it("can step over a left-out group to the next note that was played", () => {
    const e = run(64, 1.2, 0.7);
    const slots = matchPieceRunsDetailed([e], [67, 67, 66, 66, 64]);
    expect(slots.slice(0, 4).every((slot) => slot == null)).toBe(true);
    expect(slots[4]?.run).toBe(e);
  });

  it("does not fill an opening miss with a later octave of the same note", () => {
    const fs = run(66, 0.2, 0.6);
    const lowG = run(55, 4, 0.8);
    const slots = refineRepeatedPitchSlots({
      expectedMidis: [67, 66, 55],
      durationQuarters: [1, 1, 1],
      runs: [fs, lowG],
      slots: matchPieceRunsDetailed([fs, lowG], [67, 66, 55]),
    });
    expect(slots[0]).toBeNull();
    expect(slots[1]?.run).toBe(fs);
    expect(slots[2]?.run).toBe(lowG);
  });
});
