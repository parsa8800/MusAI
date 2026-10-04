import { describe, expect, it } from "vitest";
import {
  glideReelIndex,
  IDLE_TUNER_COPY_HOLD,
  IDLE_TUNER_REEL,
  nearestReelAim,
  stepTunerCopy,
  stepTunerReel,
  tunerReelNote,
  tunerReelTarget,
  TUNER_PHRASE_HOLD_MS,
  type TunerPhraseSample,
} from "@/lib/tunerNoteReel";

const sharpA: TunerPhraseSample = {
  name: "A",
  phrase: "A little sharp",
  side: "high",
};

describe("tuner reel position", () => {
  it("centers A when that note is in tune", () => {
    expect(tunerReelTarget(9, 0)).toBe(9);
    expect(tunerReelNote(9)).toBe("A");
  });

  it("slides toward the next letter as the pitch goes sharp", () => {
    expect(tunerReelTarget(9, 50)).toBeCloseTo(9.5);
    expect(tunerReelNote(10)).toBe("B♭");
  });

  it("slides back toward the previous letter when the pitch is flat", () => {
    expect(tunerReelTarget(9, -40)).toBeCloseTo(8.6);
    expect(tunerReelNote(8)).toBe("A♭");
  });

  it("takes the short way around from B to C", () => {
    expect(nearestReelAim(11.8, -0.2)).toBeCloseTo(11.8);
    expect(nearestReelAim(0.2, 11.6)).toBeCloseTo(-0.4);
  });

  it("appears on the new note after silence, then eases", () => {
    const arrived = stepTunerReel(
      IDLE_TUNER_REEL,
      { pitchClass: 9, cents: 0 },
      16,
    );
    expect(arrived.resting).toBe(false);
    expect(arrived.shown).toBe(9);

    const moving = stepTunerReel(arrived, { pitchClass: 9, cents: 50 }, 16);
    expect(moving.shown).toBeGreaterThan(9);
    expect(moving.shown).toBeLessThan(9.1);
  });

  it("stays on the last note when the sound stops", () => {
    const arrived = stepTunerReel(
      IDLE_TUNER_REEL,
      { pitchClass: 10, cents: -20 },
      16,
    );
    const held = stepTunerReel(arrived, null, 16);
    expect(held.resting).toBe(false);
    expect(held.shown).toBeCloseTo(9.8);
    expect(tunerReelNote(10)).toBe("B♭");
    expect(tunerReelNote(6)).toBe("F♯");
    expect(tunerReelNote(3)).toBe("E♭");
  });

  it("sits on a small pitch change quickly enough to stay accurate", () => {
    let shown = 9;
    const aim = 9.3;
    const first = glideReelIndex(shown, aim, 16);
    expect(first - shown).toBeGreaterThan(0.01);
    expect(first - shown).toBeLessThan(0.12);
    const frames = Math.round(420 / 16);
    for (let i = 0; i < frames; i += 1) {
      shown = glideReelIndex(shown, aim, 16);
    }
    expect(Math.abs(aim - shown)).toBeLessThan(0.05);
  });

  it("scrolls a string change at a pace you can follow", () => {
    const aim = nearestReelAim(9, 2);
    expect(Math.abs(aim - 9)).toBeGreaterThan(4);
    const first = glideReelIndex(9, aim, 16);
    expect(Math.abs(first - 9)).toBeLessThan(0.45);
    let shown = 9;
    for (let i = 0; i < Math.round(220 / 16); i += 1) {
      shown = glideReelIndex(shown, aim, 16);
    }
    expect(Math.abs(aim - shown)).toBeGreaterThan(1.5);
    for (let i = 0; i < Math.round(900 / 16); i += 1) {
      shown = glideReelIndex(shown, aim, 16);
    }
    expect(Math.abs(aim - shown)).toBeLessThan(0.6);
  });
});

describe("tuner phrase hold", () => {
  it("shows the first phrase immediately and keeps it when the sound stops", () => {
    const first = stepTunerCopy(IDLE_TUNER_COPY_HOLD, sharpA, 0);
    expect(first.shown.phrase).toBe("A little sharp");
    const quiet = stepTunerCopy(first, null, 50);
    expect(quiet.shown).toEqual(sharpA);
  });

  it("keeps the current phrase through a brief wobble", () => {
    const inTune = stepTunerCopy(
      IDLE_TUNER_COPY_HOLD,
      { name: "A", phrase: "In tune", side: "in_tune" },
      0,
    );
    const wobble = stepTunerCopy(inTune, sharpA, 100);
    expect(wobble.shown.phrase).toBe("In tune");
    const back = stepTunerCopy(
      wobble,
      { name: "A", phrase: "In tune", side: "in_tune" },
      250,
    );
    expect(back.shown.phrase).toBe("In tune");
    expect(back.pending).toBeNull();
  });

  it("changes the phrase only after it has held still", () => {
    const inTune = stepTunerCopy(
      IDLE_TUNER_COPY_HOLD,
      { name: "A", phrase: "In tune", side: "in_tune" },
      0,
    );
    const pending = stepTunerCopy(inTune, sharpA, 1000);
    const still = stepTunerCopy(
      pending,
      sharpA,
      1000 + TUNER_PHRASE_HOLD_MS - 1,
    );
    expect(still.shown.phrase).toBe("In tune");
    expect(still.shown.side).toBe("in_tune");
    const committed = stepTunerCopy(
      still,
      sharpA,
      1000 + TUNER_PHRASE_HOLD_MS,
    );
    expect(committed.shown).toEqual(sharpA);
  });
});
