import {
  formatNoteLabel,
  midiFromOctavePitch,
  splitMidi,
} from "@/lib/intonation";
import { getActiveInstrument } from "@/lib/instrument/storage";
import type { InstrumentProfile } from "@/lib/instrument/types";

export function isPlayableMidi(
  midi: number,
  instrument: InstrumentProfile = getActiveInstrument(),
): boolean {
  return midi >= instrument.midiMin && midi <= instrument.midiMax;
}

export function playableNoteOptions(
  instrument: InstrumentProfile = getActiveInstrument(),
): { midi: number; label: string }[] {
  const out: { midi: number; label: string }[] = [];
  for (let m = instrument.midiMin; m <= instrument.midiMax; m++) {
    out.push({ midi: m, label: formatNoteLabel(m) });
  }
  return out;
}

export function playablePitchClassesInOctave(
  octave: number,
  instrument: InstrumentProfile = getActiveInstrument(),
): number[] {
  const pcs: number[] = [];
  for (let pc = 0; pc < 12; pc++) {
    const m = midiFromOctavePitch(octave, pc);
    if (isPlayableMidi(m, instrument)) pcs.push(pc);
  }
  return pcs;
}

export function nearestPlayableMidiInOctave(
  octave: number,
  preferredPitchClass: number,
  instrument: InstrumentProfile = getActiveInstrument(),
): number {
  const valid = playablePitchClassesInOctave(octave, instrument);
  if (valid.length === 0) return instrument.midiMin;
  let best = valid[0]!;
  let bestDist = 99;
  for (const pc of valid) {
    const d = Math.min(
      Math.abs(pc - preferredPitchClass),
      12 - Math.abs(pc - preferredPitchClass),
    );
    if (d < bestDist) {
      bestDist = d;
      best = pc;
    }
  }
  return midiFromOctavePitch(octave, best);
}

export function playableOctaveBounds(
  instrument: InstrumentProfile = getActiveInstrument(),
): { min: number; max: number } {
  return {
    min: splitMidi(instrument.midiMin).octave,
    max: splitMidi(instrument.midiMax).octave,
  };
}

export function nearestPlayableMidiWithPitchClass(
  pitchClass: number,
  preferMidi: number,
  instrument: InstrumentProfile = getActiveInstrument(),
): number {
  const candidates: number[] = [];
  for (let m = instrument.midiMin; m <= instrument.midiMax; m++) {
    if (((m % 12) + 12) % 12 === pitchClass) candidates.push(m);
  }
  if (candidates.length === 0) return instrument.midiMin;
  let best = candidates[0]!;
  let bestDist = Math.abs(best - preferMidi);
  for (const c of candidates) {
    const d = Math.abs(c - preferMidi);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

export function chromaticNeighborMidi(
  previousMidi: number,
  newPitchClass: number,
  instrument: InstrumentProfile = getActiveInstrument(),
): number | null {
  const prevPc = ((previousMidi % 12) + 12) % 12;
  const deltaCW = (newPitchClass - prevPc + 12) % 12;
  if (deltaCW !== 1 && deltaCW !== 11) return null;
  const cand = deltaCW === 1 ? previousMidi + 1 : previousMidi - 1;
  const candPc = ((cand % 12) + 12) % 12;
  if (candPc !== newPitchClass) return null;
  if (isPlayableMidi(cand, instrument)) return cand;
  return null;
}

export function midiForPlayableCircleStep(
  previousMidi: number,
  newPitchClass: number,
  instrument: InstrumentProfile = getActiveInstrument(),
): number | null {
  const neighbor = chromaticNeighborMidi(previousMidi, newPitchClass, instrument);
  if (neighbor !== null) return neighbor;

  const { pitchClass: prevPc } = splitMidi(previousMidi);
  const deltaCW = (newPitchClass - prevPc + 12) % 12;
  if (deltaCW === 1 || deltaCW === 11) return null;

  const { octave: o } = splitMidi(previousMidi);
  const m = midiFromOctavePitch(o, newPitchClass);
  if (isPlayableMidi(m, instrument)) return m;

  return nearestPlayableMidiWithPitchClass(newPitchClass, previousMidi, instrument);
}
