/**
 * Loudness against the written dynamic marks.
 * Overall mic gain does not matter. A small wobble stays correct.
 */

/** Usual order, quietest first. */
const DYNAMIC_LEVEL: Record<string, number> = {
  ppp: 1,
  pp: 2,
  p: 3,
  mp: 4,
  mf: 5,
  f: 6,
  ff: 7,
  fff: 8,
};

/** Expected change, in dB, for one step on that ladder (p to mp, f to ff). */
const STEP_DB = 4;
/**
 * A region is marked when it is off by about one written step.
 * Smaller wobble, under this, stays correct.
 */
const TOLERANCE_DB = 3.5;

export type DynamicClockNote = {
  noteIndex: number;
  writtenDynamic: string | null;
  heardSec: number | null;
};

export type DynamicFinding = {
  noteIndex: number;
  mark: string;
  kind: "too_loud" | "too_soft";
  /** dB past the lenient window. */
  overshootDb: number;
};

type Region = {
  mark: string;
  level: number;
  noteIndex: number;
  heardSec: number[];
};

function levelOf(mark: string): number | null {
  return DYNAMIC_LEVEL[mark.toLowerCase()] ?? null;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Null when fewer than two written levels were actually heard.
 * An empty list means the loudness followed the written steps.
 */
export function findDynamicFindings(input: {
  notes: readonly DynamicClockNote[];
  mono: Float32Array;
  sampleRateHz: number;
}): DynamicFinding[] | null {
  const regions: Region[] = [];
  let current: Region | null = null;
  for (const note of input.notes) {
    const mark = note.writtenDynamic?.toLowerCase() ?? null;
    const level = mark ? levelOf(mark) : null;
    if (mark && level != null && (!current || current.mark !== mark)) {
      current = { mark, level, noteIndex: note.noteIndex, heardSec: [] };
      regions.push(current);
    }
    if (
      current &&
      typeof note.heardSec === "number" &&
      Number.isFinite(note.heardSec)
    ) {
      current.heardSec.push(note.heardSec);
    }
  }

  const measured = regions
    .map((region) => ({
      region,
      rms: regionRms(input.mono, input.sampleRateHz, region.heardSec),
    }))
    .filter((item) => item.rms > 0);
  if (measured.length < 2) return null;

  const scores = measured.map((item) => {
    const db = 20 * Math.log10(item.rms);
    return db - item.region.level * STEP_DB;
  });
  const gain = median(scores);
  const findings: DynamicFinding[] = [];
  for (let i = 0; i < measured.length; i++) {
    const residual = scores[i]! - gain;
    if (residual > TOLERANCE_DB) {
      findings.push({
        noteIndex: measured[i]!.region.noteIndex,
        mark: measured[i]!.region.mark,
        kind: "too_loud",
        overshootDb: residual - TOLERANCE_DB,
      });
    } else if (residual < -TOLERANCE_DB) {
      findings.push({
        noteIndex: measured[i]!.region.noteIndex,
        mark: measured[i]!.region.mark,
        kind: "too_soft",
        overshootDb: -residual - TOLERANCE_DB,
      });
    }
  }
  return findings;
}

function rmsBetween(
  mono: Float32Array,
  sampleRateHz: number,
  startSec: number,
  endSec: number,
): number {
  const start = Math.max(0, Math.floor(startSec * sampleRateHz));
  const end = Math.min(mono.length, Math.floor(endSec * sampleRateHz));
  if (end - start < Math.floor(0.04 * sampleRateHz)) return 0;
  let sum = 0;
  for (let i = start; i < end; i++) {
    const sample = mono[i] ?? 0;
    sum += sample * sample;
  }
  return Math.sqrt(sum / (end - start));
}

/**
 * Loudness of each heard note's body, then the middle of those.
 * One stray attack does not decide the whole dynamic.
 */
function regionRms(
  mono: Float32Array,
  sampleRateHz: number,
  heardSec: readonly number[],
): number {
  if (heardSec.length === 0) return 0;
  const times = [...heardSec].sort((a, b) => a - b);
  const levels: number[] = [];
  for (let i = 0; i < times.length; i++) {
    const start = times[i]! + 0.03;
    const untilNext = times[i + 1] != null ? times[i + 1]! - 0.02 : start + 0.16;
    const end = Math.min(start + 0.16, Math.max(start + 0.05, untilNext));
    const level = rmsBetween(mono, sampleRateHz, start, end);
    if (level > 0) levels.push(level);
  }
  if (levels.length === 0) return 0;
  return median(levels);
}
