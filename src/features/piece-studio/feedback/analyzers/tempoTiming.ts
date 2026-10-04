import type { RhythmClockNote } from "@/features/piece-studio/feedback/analyzers/rhythmTiming";

/** A short fragment is not “the whole piece.” */
const TEMPO_MIN_GAPS = 8;
/** Clearly off the written beat, or clearly slower or faster than the opening. */
const TEMPO_PACE_RATIO = 1.15;

export type TempoPace = {
  kind: "slowing" | "rushing";
  /** Even from the start, or a change as the piece goes on. */
  shape: "throughout" | "drift";
};

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Heard seconds per written quarter, in the order they were played. */
function quarterRates(notes: readonly RhythmClockNote[]): number[] {
  const heard = notes.filter(
    (note): note is RhythmClockNote & { heardSec: number } =>
      typeof note.heardSec === "number" &&
      Number.isFinite(note.heardSec) &&
      note.heardSec >= 0,
  );
  const rates: number[] = [];
  for (let i = 1; i < heard.length; i++) {
    const prev = heard[i - 1]!;
    const next = heard[i]!;
    const written = next.absoluteOnsetQuarters - prev.absoluteOnsetQuarters;
    const played = next.heardSec - prev.heardSec;
    if (!(written > 0) || !(played > 0)) continue;
    rates.push(played / written);
  }
  return rates;
}

/**
 * Whole-piece tempo only. Local early, late, and wrong lengths stay with rhythm.
 * A steady take that matches the written beat, or a take with no written beat
 * and no drift, is left unmarked.
 */
export function findTempoPace(
  notes: readonly RhythmClockNote[],
  writtenBpm: number | null,
): TempoPace | null {
  const rates = quarterRates(notes);
  if (rates.length < TEMPO_MIN_GAPS) return null;

  const third = Math.max(3, Math.floor(rates.length / 3));
  const opening = median(rates.slice(0, third));
  const ending = median(rates.slice(-third));
  if (opening > 0 && ending / opening >= TEMPO_PACE_RATIO) {
    return { kind: "slowing", shape: "drift" };
  }
  if (ending > 0 && opening / ending >= TEMPO_PACE_RATIO) {
    return { kind: "rushing", shape: "drift" };
  }

  if (
    writtenBpm == null ||
    !Number.isFinite(writtenBpm) ||
    writtenBpm < 40 ||
    writtenBpm > 220
  ) {
    return null;
  }
  const writtenSec = 60 / writtenBpm;
  const heardSec = median(rates);
  if (heardSec / writtenSec >= TEMPO_PACE_RATIO) {
    return { kind: "slowing", shape: "throughout" };
  }
  if (writtenSec / heardSec >= TEMPO_PACE_RATIO) {
    return { kind: "rushing", shape: "throughout" };
  }
  return null;
}

export function tempoExplanation(pace: TempoPace): string {
  if (pace.kind === "slowing" && pace.shape === "drift") {
    return "It started in time and got slower.";
  }
  if (pace.kind === "rushing" && pace.shape === "drift") {
    return "It started in time and got faster.";
  }
  if (pace.kind === "slowing") {
    return "The beat was slower all the way through.";
  }
  return "The beat was faster all the way through.";
}
