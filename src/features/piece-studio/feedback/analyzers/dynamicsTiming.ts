/**
 * Loudness against the written dynamic marks.
 * Overall mic gain does not matter.
 * A softer mark only has to be softer than the louder music.
 * A small wobble stays correct. Matching the louder mark does not.
 * A hairpin is judged on its own shape, and that fade is not
 * treated as the letter it started from.
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
  /** Quarter notes from the start of the piece. Hairpins use this. */
  absoluteOnsetQuarters?: number;
};

export type DynamicFinding = {
  noteIndex: number;
  mark: string;
  kind: "too_loud" | "too_soft";
  /** dB past the lenient window. */
  overshootDb: number;
};

export type HairpinClock = {
  direction: "crescendo" | "decrescendo";
  noteIndex: number;
  startQuarters: number;
  endQuarters: number;
};

export type HairpinFinding = {
  noteIndex: number;
  direction: "crescendo" | "decrescendo";
  kind: "unchanged" | "reversed";
  /** How far the change missed a clear swell, in dB. */
  deltaDb: number;
};

/**
 * A swell smaller than this is no change. The opposite sign is reversed.
 * A little bump inside one half does not count. The two halves do.
 */
const HAIRPIN_CHANGE_DB = 2;

/**
 * A written step that is at least this much quieter or louder
 * followed the mark. Anything smaller is as loud as the other music.
 */
const CLEAR_ORDER_DB = 1.5;

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
 * Notes from a hairpin onward belong to the shape, not the letter
 * they started under, until the next letter.
 */
export function findDynamicFindings(input: {
  notes: readonly DynamicClockNote[];
  mono: Float32Array;
  sampleRateHz: number;
  hairpins?: readonly HairpinClock[];
}): DynamicFinding[] | null {
  const hairpins = input.hairpins ?? [];
  const regions: Region[] = [];
  let current: Region | null = null;
  let regionStart = 0;
  for (const note of input.notes) {
    const mark = note.writtenDynamic?.toLowerCase() ?? null;
    const level = mark ? levelOf(mark) : null;
    if (mark && level != null && (!current || current.mark !== mark)) {
      current = { mark, level, noteIndex: note.noteIndex, heardSec: [] };
      regions.push(current);
      regionStart = note.absoluteOnsetQuarters ?? regionStart;
    }
    if (!current) continue;
    const onset = note.absoluteOnsetQuarters;
    if (
      typeof onset === "number" &&
      noteFollowsHairpin(regionStart, onset, hairpins)
    ) {
      continue;
    }
    if (typeof note.heardSec === "number" && Number.isFinite(note.heardSec)) {
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

  const heard = measured.map((item) => ({
    ...item,
    db: 20 * Math.log10(item.rms),
  }));
  if (followsWrittenOrder(heard)) return [];

  const scores = heard.map(
    (item) => item.db - item.region.level * STEP_DB,
  );
  const gain = median(scores);
  const findings: DynamicFinding[] = [];
  for (let i = 0; i < heard.length; i++) {
    const residual = scores[i]! - gain;
    if (residual > TOLERANCE_DB) {
      findings.push({
        noteIndex: heard[i]!.region.noteIndex,
        mark: heard[i]!.region.mark,
        kind: "too_loud",
        overshootDb: residual - TOLERANCE_DB,
      });
    } else if (residual < -TOLERANCE_DB) {
      findings.push({
        noteIndex: heard[i]!.region.noteIndex,
        mark: heard[i]!.region.mark,
        kind: "too_soft",
        overshootDb: -residual - TOLERANCE_DB,
      });
    }
  }
  return findings;
}

/** A softer written mark has to sit below every louder one. */
function followsWrittenOrder(
  heard: readonly { db: number; region: Region }[],
): boolean {
  for (let i = 0; i < heard.length; i++) {
    for (let j = 0; j < heard.length; j++) {
      if (heard[i]!.region.level >= heard[j]!.region.level) continue;
      if (heard[i]!.db > heard[j]!.db - CLEAR_ORDER_DB) return false;
    }
  }
  return true;
}

/**
 * True once a hairpin has begun under this letter.
 * The fade, and whatever follows it until the next letter,
 * is not the letter's own level.
 */
function noteFollowsHairpin(
  regionStart: number,
  onset: number,
  hairpins: readonly HairpinClock[],
): boolean {
  return hairpins.some(
    (hairpin) =>
      hairpin.startQuarters >= regionStart - 0.05 &&
      hairpin.startQuarters <= onset + 0.05,
  );
}

/**
 * A crescendo should get louder by the end of the hairpin.
 * A decrescendo should get softer. No clear change, or the opposite, is wrong.
 * The comparison is inside the hairpin, not against a fixed piano level.
 */
export function findHairpinFindings(input: {
  hairpins: readonly HairpinClock[];
  notes: readonly DynamicClockNote[];
  mono: Float32Array;
  sampleRateHz: number;
}): HairpinFinding[] {
  const findings: HairpinFinding[] = [];
  for (const hairpin of input.hairpins) {
    const heard = input.notes
      .filter((note) => {
        const onset = note.absoluteOnsetQuarters;
        if (typeof onset !== "number") return false;
        if (onset < hairpin.startQuarters - 0.05) return false;
        if (onset >= hairpin.endQuarters - 0.05) return false;
        return typeof note.heardSec === "number" && note.heardSec >= 0;
      })
      .map((note) => note.heardSec as number)
      .sort((a, b) => a - b);
    if (heard.length < 2) continue;
    if (heard[heard.length - 1]! - heard[0]! < 0.2) continue;
    const levels = noteBodyDb(input.mono, input.sampleRateHz, heard);
    if (levels.length < 2) continue;
    const mid = Math.floor(levels.length / 2);
    const early = median(levels.slice(0, mid));
    const late = median(levels.slice(mid));
    const deltaDb = late - early;
    const growing = hairpin.direction === "crescendo";
    const followed = growing
      ? deltaDb >= HAIRPIN_CHANGE_DB
      : deltaDb <= -HAIRPIN_CHANGE_DB;
    if (followed) continue;
    const reversed = growing
      ? deltaDb <= -HAIRPIN_CHANGE_DB
      : deltaDb >= HAIRPIN_CHANGE_DB;
    findings.push({
      noteIndex: hairpin.noteIndex,
      direction: hairpin.direction,
      kind: reversed ? "reversed" : "unchanged",
      deltaDb,
    });
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
  const levels = noteBodyLevels(mono, sampleRateHz, heardSec);
  if (levels.length === 0) return 0;
  return median(levels);
}

/** dB of each note body, in the order the notes were heard. */
function noteBodyDb(
  mono: Float32Array,
  sampleRateHz: number,
  heardSec: readonly number[],
): number[] {
  return noteBodyLevels(mono, sampleRateHz, heardSec).map(
    (level) => 20 * Math.log10(level),
  );
}

function noteBodyLevels(
  mono: Float32Array,
  sampleRateHz: number,
  heardSec: readonly number[],
): number[] {
  if (heardSec.length === 0) return [];
  const times = [...heardSec].sort((a, b) => a - b);
  const levels: number[] = [];
  for (let i = 0; i < times.length; i++) {
    const start = times[i]! + 0.03;
    const untilNext = times[i + 1] != null ? times[i + 1]! - 0.02 : start + 0.16;
    const end = Math.min(start + 0.16, Math.max(start + 0.05, untilNext));
    const level = rmsBetween(mono, sampleRateHz, start, end);
    if (level > 0) levels.push(level);
  }
  return levels;
}
