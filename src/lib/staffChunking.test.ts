import { describe, expect, it } from "vitest";
import {
  chunkMidisAtOctaves,
  chunkMidisForStaff,
  chunkMidisForStaffPaired,
  maxNotesPerStaffRow,
  packOctaveChunks,
  staffRowWidthPx,
  STAFF_NOTE_MIN_GAP_PX,
} from "@/lib/staffChunking";

const C_MAJOR_2OCT_ASC = [
  60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84,
];
const C_MAJOR_2OCT_DESC = [
  84, 83, 81, 79, 77, 76, 74, 72, 71, 69, 67, 65, 64, 62, 60,
];

describe("maxNotesPerStaffRow", () => {
  it("returns at least 2", () => {
    expect(maxNotesPerStaffRow(100)).toBeGreaterThanOrEqual(2);
  });

  it("grows with usable width up to a cap", () => {
    expect(maxNotesPerStaffRow(900)).toBeGreaterThan(maxNotesPerStaffRow(200));
    expect(maxNotesPerStaffRow(2000)).toBe(maxNotesPerStaffRow(900));
  });
});

describe("chunkMidisAtOctaves", () => {
  it("splits a two-octave ascent at the middle tonic", () => {
    expect(chunkMidisAtOctaves(C_MAJOR_2OCT_ASC)).toEqual([
      C_MAJOR_2OCT_ASC.slice(0, 8),
      C_MAJOR_2OCT_ASC.slice(8),
    ]);
  });

  it("splits a two-octave descent at the middle tonic", () => {
    expect(chunkMidisAtOctaves(C_MAJOR_2OCT_DESC)).toEqual([
      C_MAJOR_2OCT_DESC.slice(0, 8),
      C_MAJOR_2OCT_DESC.slice(8),
    ]);
  });

  it("keeps a one-octave run intact", () => {
    const one = C_MAJOR_2OCT_ASC.slice(0, 8);
    expect(chunkMidisAtOctaves(one)).toEqual([one]);
  });
});

describe("chunkMidisForStaff", () => {
  it("keeps the full ascending run on one staff when width allows", () => {
    expect(chunkMidisForStaff(C_MAJOR_2OCT_ASC, 15)).toEqual([
      C_MAJOR_2OCT_ASC,
    ]);
  });

  it("falls back to whole-octave rows — never mid-run shards", () => {
    expect(chunkMidisForStaff(C_MAJOR_2OCT_ASC, 10)).toEqual([
      C_MAJOR_2OCT_ASC.slice(0, 8),
      C_MAJOR_2OCT_ASC.slice(8),
    ]);
  });

  it("does not carve an octave into tiny balanced fragments", () => {
    const oneOct = C_MAJOR_2OCT_ASC.slice(0, 8);
    // Even with a tiny max, keep the octave together.
    expect(chunkMidisForStaff(oneOct, 4)).toEqual([oneOct]);
  });
});

describe("packOctaveChunks", () => {
  it("merges octaves onto one row when they fit", () => {
    const octaves = chunkMidisAtOctaves(C_MAJOR_2OCT_ASC);
    expect(packOctaveChunks(octaves, 15)).toEqual([C_MAJOR_2OCT_ASC]);
  });
});

describe("chunkMidisForStaffPaired", () => {
  it("uses one row each when both sequences fit", () => {
    const { ascending: a, descending: d } = chunkMidisForStaffPaired(
      C_MAJOR_2OCT_ASC,
      C_MAJOR_2OCT_DESC.slice(1), // 14 notes, peak once
      15,
    );
    expect(a).toEqual([C_MAJOR_2OCT_ASC]);
    expect(d.length).toBe(1);
    expect(d[0]!.length).toBe(14);
  });

  it("breaks each direction at octaves when the full run does not fit", () => {
    const { ascending: a, descending: d } = chunkMidisForStaffPaired(
      C_MAJOR_2OCT_ASC,
      C_MAJOR_2OCT_DESC,
      10,
    );
    expect(a).toEqual([
      C_MAJOR_2OCT_ASC.slice(0, 8),
      C_MAJOR_2OCT_ASC.slice(8),
    ]);
    expect(d).toEqual([
      C_MAJOR_2OCT_DESC.slice(0, 8),
      C_MAJOR_2OCT_DESC.slice(8),
    ]);
  });
});

describe("staffRowWidthPx", () => {
  it("adds spacing between notes", () => {
    const w1 = staffRowWidthPx(1);
    const w4 = staffRowWidthPx(4);
    expect(w4 - w1).toBe(3 * STAFF_NOTE_MIN_GAP_PX);
  });
});
