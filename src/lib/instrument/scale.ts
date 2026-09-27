import { midiFromOctavePitch } from "@/lib/intonation";
import { isPlayableMidi } from "@/lib/instrument/range";
import { getActiveInstrument } from "@/lib/instrument/storage";
import type { InstrumentProfile } from "@/lib/instrument/types";

export function rootsForTonic(
  tonicPitchClass: number,
  instrument: InstrumentProfile = getActiveInstrument(),
): number[] {
  const pc = ((tonicPitchClass % 12) + 12) % 12;
  const out: number[] = [];
  for (let m = instrument.midiMin; m <= instrument.midiMax; m++) {
    if (((m % 12) + 12) % 12 === pc) out.push(m);
  }
  return out;
}

export function defaultRootMidi(
  tonicPitchClass: number,
  instrument: InstrumentProfile = getActiveInstrument(),
): number {
  const roots = rootsForTonic(tonicPitchClass, instrument);
  if (roots.length === 0) return instrument.midiMin;
  const prefer = midiFromOctavePitch(instrument.defaultRootOctave, tonicPitchClass);
  let best = roots[0]!;
  let bestDist = 999;
  for (const r of roots) {
    const d = Math.abs(r - prefer);
    if (d < bestDist) {
      bestDist = d;
      best = r;
    }
  }
  return best;
}

export function validateScaleMidisInRange(
  midis: readonly number[],
  instrument: InstrumentProfile = getActiveInstrument(),
): boolean {
  return midis.every((m) => isPlayableMidi(m, instrument));
}

export function tonicOptionsFor(
  instrument: InstrumentProfile = getActiveInstrument(),
): { pitchClass: number; label: string }[] {
  const names = [
    "C",
    "C♯",
    "D",
    "D♯",
    "E",
    "F",
    "F♯",
    "G",
    "G♯",
    "A",
    "A♯",
    "B",
  ] as const;
  const seen = new Set<number>();
  const out: { pitchClass: number; label: string }[] = [];
  for (let m = instrument.midiMin; m <= instrument.midiMax; m++) {
    const pc = ((m % 12) + 12) % 12;
    if (seen.has(pc)) continue;
    seen.add(pc);
    out.push({ pitchClass: pc, label: names[pc]! });
  }
  out.sort((a, b) => a.pitchClass - b.pitchClass);
  return out;
}

export function scaleFitsRange(
  expectedMidis: readonly number[],
  octaveShift: number,
  instrument: InstrumentProfile = getActiveInstrument(),
): boolean {
  return expectedMidis.every((m) => {
    const shifted = m + 12 * octaveShift;
    return isPlayableMidi(shifted, instrument);
  });
}
