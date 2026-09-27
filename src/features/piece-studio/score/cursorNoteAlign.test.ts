import { describe, expect, it } from "vitest";
import {
  alignCursorSamplesToNotes,
  alignNoteheadPosesToNotes,
  collapsePlaybackNoteAttacks,
  inferOsmdRealValueUnit,
  trimLeadingCursorSamples,
  type CursorWalkSample,
} from "@/features/piece-studio/score/cursorNoteAlign";

/** wholeNotes → seconds at 80 bpm (quarter = 0.75s). */
function wholeToSec(wn: number): number {
  return wn * 4 * (60 / 80);
}

describe("alignCursorSamplesToNotes", () => {
  const notes = [
    { startSec: 0, endSec: 0.75 },
    { startSec: 0.75, endSec: 1.5 },
    { startSec: 1.5, endSec: 2.25 },
    { startSec: 2.25, endSec: 3 },
    { startSec: 3, endSec: 3.75 },
  ];

  it("zips OSMD poses to MusaiScore note times when counts match", () => {
    const samples: CursorWalkSample[] = notes.map((_, i) => ({
      realValue: i * 0.25,
      x: 100 + i * 40,
      y: 50,
      height: 40,
    }));
    const snaps = alignCursorSamplesToNotes(samples, notes, wholeToSec);
    expect(snaps).toHaveLength(5);
    expect(snaps.map((s) => s.tSec)).toEqual(notes.map((n) => n.startSec));
    expect(snaps[4]?.x).toBe(260);
  });

  it("drops a leading clef/time-sig sample then zips", () => {
    const samples: CursorWalkSample[] = [
      { realValue: 0, x: 40, y: 50, height: 40 }, // time signature
      ...notes.map((_, i) => ({
        realValue: i * 0.25,
        x: 100 + i * 40,
        y: 50,
        height: 40,
      })),
    ];
    expect(trimLeadingCursorSamples(samples, notes.length)).toHaveLength(5);
    const snaps = alignCursorSamplesToNotes(samples, notes, wholeToSec);
    expect(snaps[0]?.x).toBe(100);
    expect(snaps[0]?.tSec).toBe(0);
    expect(snaps[4]?.x).toBe(260);
  });

  it("DOM noteheads keep the opening heads when a couple of trailing extras exist", () => {
    const heads: CursorWalkSample[] = [
      ...notes.map((_, i) => ({
        realValue: i,
        x: 100 + i * 40,
        y: 50,
        height: 40,
      })),
      { realValue: 99, x: 400, y: 50, height: 40 },
      { realValue: 100, x: 440, y: 50, height: 40 },
    ];
    const snaps = alignNoteheadPosesToNotes(heads, notes);
    expect(snaps).toHaveLength(5);
    expect(snaps[0]?.x).toBe(100);
    expect(snaps[0]?.tSec).toBe(0);
    expect(snaps[4]?.x).toBe(260);
  });

  it("drops small cue heads so remaining principals zip 1:1", () => {
    const notes = [
      { startSec: 0, endSec: 0.5 },
      { startSec: 0.5, endSec: 1 },
      { startSec: 1, endSec: 1.5 },
    ];
    const heads: CursorWalkSample[] = [
      { realValue: 0, x: 100, y: 50, height: 12, width: 10 },
      { realValue: 1, x: 118, y: 42, height: 6, width: 5 }, // grace
      { realValue: 2, x: 140, y: 50, height: 12, width: 10 },
      { realValue: 3, x: 180, y: 50, height: 12, width: 10 },
    ];
    const snaps = alignNoteheadPosesToNotes(heads, notes);
    expect(snaps).toHaveLength(3);
    expect(snaps.map((s) => s.x)).toEqual([100, 140, 180]);
    expect(snaps[0]?.endSec).toBe(0.5);
  });

  it("drops same-size tucked grace heads so remaining principals zip 1:1", () => {
    const notes = [
      { startSec: 0, endSec: 0.5 },
      { startSec: 0.5, endSec: 1 },
      { startSec: 1, endSec: 1.5 },
    ];
    const heads: CursorWalkSample[] = [
      { realValue: 0, x: 100, y: 50, height: 12, width: 10 },
      { realValue: 1, x: 124, y: 36, height: 12, width: 10 }, // full-size acciaccatura
      { realValue: 2, x: 140, y: 50, height: 12, width: 10 },
      { realValue: 3, x: 180, y: 50, height: 12, width: 10 },
    ];
    const snaps = alignNoteheadPosesToNotes(heads, notes);
    expect(snaps).toHaveLength(3);
    expect(snaps.map((s) => s.x)).toEqual([100, 140, 180]);
  });

  it("maps many extra DOM heads by progress so the playhead does not lag", () => {
    const heads: CursorWalkSample[] = Array.from({ length: 20 }, (_, i) => ({
      realValue: i,
      x: 100 + i * 20,
      y: 50,
      height: 40,
    }));
    const snaps = alignNoteheadPosesToNotes(heads, notes);
    expect(snaps).toHaveLength(5);
    expect(snaps[0]?.x).toBe(100);
    expect(snaps[4]?.x).toBe(100 + 19 * 20);
    expect(snaps[2]?.x).toBeGreaterThan(snaps[0]!.x);
    expect(snaps[2]?.x).toBeLessThan(snaps[4]!.x);
  });

  it("collapses chord attacks so double-stops zip 1:1 with noteheads", () => {
    const chordy = [
      { startSec: 0, endSec: 0.5 },
      { startSec: 0, endSec: 0.5 }, // lower chord tone
      { startSec: 0.5, endSec: 1 },
      { startSec: 0.5, endSec: 1 },
      { startSec: 1, endSec: 1.5 },
    ];
    expect(collapsePlaybackNoteAttacks(chordy)).toEqual([
      { startSec: 0, endSec: 0.5 },
      { startSec: 0.5, endSec: 1 },
      { startSec: 1, endSec: 1.5 },
    ]);
    const heads: CursorWalkSample[] = [
      { realValue: 0, x: 100, y: 50, height: 40 },
      { realValue: 1, x: 140, y: 50, height: 40 },
      { realValue: 2, x: 180, y: 50, height: 40 },
    ];
    const snaps = alignNoteheadPosesToNotes(heads, chordy);
    expect(snaps).toHaveLength(3);
    expect(snaps.map((s) => s.tSec)).toEqual([0, 0.5, 1]);
    expect(snaps.map((s) => s.x)).toEqual([100, 140, 180]);
  });

  it("keeps moving when the walk stops mid-piece (no freeze on last sample)", () => {
    const short: CursorWalkSample[] = [
      { realValue: 0, x: 100, y: 50, height: 40 },
      { realValue: 0.25, x: 140, y: 50, height: 40 },
      { realValue: 0.5, x: 180, y: 50, height: 40 },
    ];
    const snaps = alignCursorSamplesToNotes(short, notes, wholeToSec);
    expect(snaps).toHaveLength(5);
    expect(snaps[0]?.x).toBe(100);
    expect(snaps[4]?.x).toBe(180);
    // Mid notes land on a real head — not stuck on the first or last only.
    expect(snaps[2]?.x).toBeGreaterThan(100);
    expect(snaps[2]?.x).toBeLessThan(180);
    expect(snaps.map((s) => s.tSec)).toEqual(notes.map((n) => n.startSec));
  });

  it("infers quarter RealValue when whole-note convert overshoots duration", () => {
    const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    expect(inferOsmdRealValueUnit(values, 12, wholeToSec)).toBe("quarter");
    expect(
      inferOsmdRealValueUnit(
        values.map((q) => q / 4),
        12,
        wholeToSec,
      ),
    ).toBe("whole");
  });
});
