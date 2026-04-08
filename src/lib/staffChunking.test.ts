import { describe, expect, it } from "vitest";
import {
  chunkMidisForStaff,
  chunkMidisForStaffPaired,
  maxNotesPerStaffRow,
  staffRowWidthPx,
  STAFF_NOTE_MIN_GAP_PX,
} from "@/lib/staffChunking";

describe("maxNotesPerStaffRow", () => {
  it("returns at least 2", () => {
    expect(maxNotesPerStaffRow(100)).toBeGreaterThanOrEqual(2);
  });

  it("grows with usable width up to a cap", () => {
    expect(maxNotesPerStaffRow(900)).toBeGreaterThan(maxNotesPerStaffRow(200));
    expect(maxNotesPerStaffRow(2000)).toBe(maxNotesPerStaffRow(900));
  });
});

describe("chunkMidisForStaff", () => {
  it("chunks by max per row", () => {
    const midis = [60, 62, 64, 66, 68, 70, 72, 74, 76];
    expect(chunkMidisForStaff(midis, 4)).toEqual([
      [60, 62, 64],
      [66, 68, 70],
      [72, 74, 76],
    ]);
  });

  it("avoids a single trailing note when possible", () => {
    const midis = [60, 62, 64, 66, 68, 70, 72, 74, 76];
    const chunks = chunkMidisForStaff(midis, 4);
    expect(Math.min(...chunks.map((c) => c.length))).toBeGreaterThanOrEqual(3);
  });
});

describe("chunkMidisForStaffPaired", () => {
  it("uses one row each when both sequences fit (15 vs 14 notes)", () => {
    const asc = Array.from({ length: 15 }, (_, i) => 60 + i);
    const desc = Array.from({ length: 14 }, (_, i) => 74 - i);
    const { ascending: a, descending: d } = chunkMidisForStaffPaired(
      asc,
      desc,
      15,
    );
    expect(a.length).toBe(1);
    expect(d.length).toBe(1);
    expect(a[0]!.length).toBe(15);
    expect(d[0]!.length).toBe(14);
  });

  it("matches row count when ascending needs one more row than descending (15 vs 14, cap 14)", () => {
    const asc = Array.from({ length: 15 }, (_, i) => 60 + i);
    const desc = Array.from({ length: 14 }, (_, i) => 74 - i);
    const { ascending: a, descending: d } = chunkMidisForStaffPaired(
      asc,
      desc,
      14,
    );
    expect(a.length).toBe(2);
    expect(d.length).toBe(2);
    expect(a.map((row) => row.length)).toEqual([8, 7]);
    expect(d.map((row) => row.length)).toEqual([7, 7]);
  });
});

describe("staffRowWidthPx", () => {
  it("adds spacing between notes", () => {
    const w1 = staffRowWidthPx(1);
    const w4 = staffRowWidthPx(4);
    expect(w4 - w1).toBe(3 * STAFF_NOTE_MIN_GAP_PX);
  });
});
