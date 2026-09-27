import { describe, expect, it } from "vitest";
import { midiToHz } from "@/lib/intonation";
import { getInstrument } from "@/lib/instrument";
import {
  glideTunerMeterCents,
  IDLE_TUNER_METER,
  stepTunerMeter,
  TUNER_METER_FIT_CENTS,
  TUNER_METER_MAX_FRAME_MS,
  TUNER_METER_SETTLE_MS,
  TUNER_METER_SPAN_CENTS,
  tunerMeterMaxStep,
  tunerMeterPercents,
  tunerMeterSide,
  type TunerMeterMotion,
} from "@/lib/tunerMeterMotion";
import { identifyTunerPitch, TUNER_IN_TUNE_CENTS } from "@/lib/violinTuner";

const FRAME_MS = 16;

function run(
  samples: Array<number | null>,
  frameMs = FRAME_MS,
  instant = false,
): TunerMeterMotion {
  let state = IDLE_TUNER_METER;
  let now = 0;
  for (const sample of samples) {
    now += frameMs;
    state = stepTunerMeter(state, sample, now, frameMs, instant);
  }
  return state;
}

function hold(sample: number, ms: number, start = IDLE_TUNER_METER, t0 = 0) {
  const frames = Math.ceil(ms / FRAME_MS);
  let state = start;
  let now = t0;
  const shown: number[] = [];
  for (let i = 0; i < frames; i++) {
    now += FRAME_MS;
    state = stepTunerMeter(state, sample, now, FRAME_MS);
    shown.push(state.shown);
  }
  return { state, now, shown };
}

describe("glideTunerMeterCents", () => {
  it("keeps each step small, and smaller as the gap closes", () => {
    let shown = -TUNER_METER_SPAN_CENTS;
    let previous = Infinity;
    const cap = tunerMeterMaxStep(FRAME_MS);
    for (let i = 0; i < 12; i++) {
      const next = glideTunerMeterCents(shown, TUNER_METER_SPAN_CENTS, FRAME_MS);
      const step = next - shown;
      expect(step).toBeGreaterThan(0);
      expect(step).toBeLessThanOrEqual(cap + 1e-6);
      expect(step).toBeLessThanOrEqual(previous + 1e-6);
      previous = step;
      shown = next;
    }
    expect(cap).toBeLessThan(2);
  });

  it("lands on the aim without passing it", () => {
    let shown = 0;
    for (let t = 0; t < 4000; t += FRAME_MS) {
      const next = glideTunerMeterCents(shown, 50, FRAME_MS);
      expect(next).toBeGreaterThanOrEqual(shown);
      expect(next).toBeLessThanOrEqual(50);
      shown = next;
    }
    expect(shown).toBeCloseTo(50, 1);
    expect(glideTunerMeterCents(shown, 50, FRAME_MS)).toBeCloseTo(50, 1);
  });

  it("does not cross the meter in one stalled frame", () => {
    const next = glideTunerMeterCents(-50, 50, 800);
    expect(next).toBeCloseTo(-50 + tunerMeterMaxStep(TUNER_METER_MAX_FRAME_MS), 5);
    expect(next).toBeLessThan(0);
  });

  it("snaps only when motion is reduced", () => {
    expect(glideTunerMeterCents(-40, 40, FRAME_MS, true)).toBe(40);
  });
});

describe("stepTunerMeter", () => {
  it("settles a held flat note on the low side and leaves it there", () => {
    const flat = hold(-42, 4200);
    expect(tunerMeterSide(flat.state.shown)).toBe("low");
    expect(flat.state.shown).toBeCloseTo(-42, 1);
    const later = hold(-42, 400, flat.state, flat.now);
    expect(later.state.shown).toBeCloseTo(flat.state.shown, 2);
    expect(tunerMeterPercents(later.state.shown).left).toBeLessThan(40);
  });

  it("settles a held sharp note on the high side and leaves it there", () => {
    const sharp = hold(38, 4200);
    expect(tunerMeterSide(sharp.state.shown)).toBe("high");
    expect(sharp.state.shown).toBeCloseTo(38, 1);
    const later = hold(38, 400, sharp.state, sharp.now);
    expect(later.state.shown).toBeCloseTo(sharp.state.shown, 2);
    expect(tunerMeterPercents(later.state.shown).left).toBeGreaterThan(60);
  });

  it("keeps a steady in-tune offset inside the window", () => {
    const settled = hold(TUNER_IN_TUNE_CENTS - 2, 4800);
    expect(tunerMeterSide(settled.state.shown)).toBe("in_tune");
    expect(settled.state.shown).toBeCloseTo(TUNER_IN_TUNE_CENTS - 2, 1);
    expect(settled.state.shown).not.toBe(0);
  });

  it("ignores a brief flip to the other side", () => {
    const flat = hold(-40, 4200);
    const flickerFrames = Math.floor(120 / FRAME_MS);
    let state = flat.state;
    let now = flat.now;
    for (let i = 0; i < flickerFrames; i++) {
      now += FRAME_MS;
      state = stepTunerMeter(state, 45, now, FRAME_MS);
    }
    expect(state.aim).toBeCloseTo(-40, 5);
    expect(tunerMeterSide(state.shown)).toBe("low");
    expect(Math.abs(state.shown - flat.state.shown)).toBeLessThan(2);
  });

  it("barely moves when a held note wobbles by a few cents", () => {
    const flat = hold(-28, 3600);
    let state = flat.state;
    let now = flat.now;
    let min = state.shown;
    let max = state.shown;
    for (let i = 0; i < 40; i++) {
      now += FRAME_MS;
      const sample = i % 2 === 0 ? -28 - 6 : -28 + 6;
      state = stepTunerMeter(state, sample, now, FRAME_MS);
      min = Math.min(min, state.shown);
      max = Math.max(max, state.shown);
    }
    expect(max - min).toBeLessThan(2);
    expect(tunerMeterSide(state.shown)).toBe("low");
    expect(state.shown).toBeCloseTo(-28, 0);
  });

  it("eases into the center socket and stays seated on a centered note", () => {
    const seated = hold(1.2, 3600);
    expect(Math.abs(seated.state.shown)).toBeLessThanOrEqual(TUNER_METER_FIT_CENTS);
    expect(seated.state.shown).toBeCloseTo(1.2, 0);
    const later = hold(1.2, 400, seated.state, seated.now);
    expect(Math.abs(later.state.shown - seated.state.shown)).toBeLessThan(0.2);
  });

  it("glides from a held flat note to a held sharp note without a jump", () => {
    const flat = hold(-45, 1800);
    expect(tunerMeterSide(flat.state.shown)).toBe("low");

    let state = flat.state;
    let now = flat.now;
    const deltas: number[] = [];
    let crossed = false;
    for (let t = 0; t < 5200; t += FRAME_MS) {
      now += FRAME_MS;
      const next = stepTunerMeter(state, 45, now, FRAME_MS);
      const moved = next.shown - state.shown;
      if (next.aim > 0 && next.shown < 45 - 1) {
        deltas.push(moved);
        crossed = true;
      }
      state = next;
    }

    expect(crossed).toBe(true);
    expect(tunerMeterSide(state.shown)).toBe("high");
    expect(state.shown).toBeCloseTo(45, 0);
    expect(deltas.length).toBeGreaterThan(8);
    for (const delta of deltas) {
      expect(delta).toBeGreaterThan(0);
      expect(delta).toBeLessThanOrEqual(tunerMeterMaxStep(FRAME_MS) + 0.05);
    }
    const started = tunerMeterPercents(flat.state.shown).left;
    const ended = tunerMeterPercents(state.shown).left;
    expect(started).toBeLessThan(20);
    expect(ended).toBeGreaterThan(80);
  });

  it("does not whip back and forth when the side flickers", () => {
    let state = hold(-36, 4200).state;
    let now = 4200;
    let min = state.shown;
    let max = state.shown;
    for (let i = 0; i < 30; i++) {
      now += FRAME_MS;
      const sample = i % 2 === 0 ? 40 : -36;
      state = stepTunerMeter(state, sample, now, FRAME_MS);
      min = Math.min(min, state.shown);
      max = Math.max(max, state.shown);
    }
    expect(max - min).toBeLessThan(4);
    expect(tunerMeterSide(state.shown)).toBe("low");
  });

  it("glides home on silence instead of jumping to center", () => {
    const flat = hold(-50, 1800);
    const next = stepTunerMeter(flat.state, null, flat.now + FRAME_MS, FRAME_MS);
    expect(next.aim).toBe(0);
    expect(next.shown).toBeGreaterThan(-50);
    expect(next.shown).toBeLessThan(-40);
  });

  it("uses the same glide for violin and viola cents", () => {
    const cases = [
      {
        instrument: getInstrument("violin"),
        flatHz: 440 * Math.pow(2, -40 / 1200),
        sharpHz: 440 * Math.pow(2, 40 / 1200),
      },
      {
        instrument: getInstrument("viola"),
        flatHz: midiToHz(48) * Math.pow(2, -40 / 1200),
        sharpHz: midiToHz(48) * Math.pow(2, 40 / 1200),
      },
    ];

    for (const { instrument, flatHz, sharpHz } of cases) {
      const flat = identifyTunerPitch(flatHz, null, instrument)!;
      const sharp = identifyTunerPitch(sharpHz, null, instrument)!;
      expect(flat.direction).toBe("low");
      expect(sharp.direction).toBe("high");
      expect(Math.abs(flat.cents)).toBeGreaterThan(TUNER_IN_TUNE_CENTS);
      expect(sharp.cents).toBeGreaterThan(TUNER_IN_TUNE_CENTS);

      const settledFlat = hold(flat.cents, 1800);
      expect(tunerMeterSide(settledFlat.state.shown)).toBe("low");
      const settledSharp = hold(sharp.cents, 2800, settledFlat.state, settledFlat.now);
      expect(tunerMeterSide(settledSharp.state.shown)).toBe("high");

      const jump = Math.max(
        ...settledSharp.shown.slice(1).map((cents, i) => cents - settledSharp.shown[i]!),
      );
      expect(jump).toBeLessThan(tunerMeterMaxStep(FRAME_MS) + 0.05);
    }
  });
});

describe("tunerMeterSide", () => {
  it("matches the in-tune window without collapsing those cents to zero", () => {
    expect(tunerMeterSide(TUNER_IN_TUNE_CENTS)).toBe("in_tune");
    expect(tunerMeterSide(-TUNER_IN_TUNE_CENTS)).toBe("in_tune");
    expect(tunerMeterSide(TUNER_IN_TUNE_CENTS + 0.1)).toBe("high");
    expect(tunerMeterSide(-(TUNER_IN_TUNE_CENTS + 0.1))).toBe("low");
  });
});

describe("reduced motion", () => {
  it("still waits out a flicker, then snaps to a side that holds", () => {
    const flat = run(Array.from({ length: 40 }, () => -30), FRAME_MS, true);
    expect(flat.shown).toBeCloseTo(-30, 5);
    const flicker = run(
      [...Array.from({ length: 40 }, () => -30), ...Array.from({ length: 4 }, () => 40)],
      FRAME_MS,
      true,
    );
    expect(flicker.shown).toBeCloseTo(-30, 5);
    const held = run(
      [
        ...Array.from({ length: 40 }, () => -30),
        ...Array.from({ length: Math.ceil(TUNER_METER_SETTLE_MS / FRAME_MS) + 2 }, () => 40),
      ],
      FRAME_MS,
      true,
    );
    expect(held.shown).toBeCloseTo(40, 5);
  });
});
