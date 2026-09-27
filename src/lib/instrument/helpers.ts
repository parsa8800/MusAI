import {
  allInstruments,
  getInstrument,
  parseInstrumentId,
} from "@/lib/instrument/catalog";
import type { InstrumentId, InstrumentProfile } from "@/lib/instrument/types";

export function uniqueOpenStrings(
  instrument: InstrumentProfile,
  among: readonly InstrumentProfile[] = allInstruments(),
): InstrumentProfile["openStrings"][number][] {
  const others = new Set(
    among
      .filter((other) => other.id !== instrument.id)
      .flatMap((other) => other.openStrings.map((s) => s.id)),
  );
  return instrument.openStrings.filter((s) => !others.has(s.id));
}

export function openStringListCopy(instrument: InstrumentProfile): string {
  const letters = instrument.openStrings.map((s) => s.id);
  if (letters.length === 0) return "";
  if (letters.length === 1) return letters[0]!;
  if (letters.length === 2) return `${letters[0]} or ${letters[1]}`;
  return `${letters.slice(0, -1).join(", ")}, or ${letters[letters.length - 1]}`;
}

export function vexflowClef(instrument: InstrumentProfile): InstrumentProfile["clef"] {
  return instrument.clef;
}

/** Bowed instruments carry open-string fingering. Keyboards do not. */
export function hasStringFingering(instrument: InstrumentProfile): boolean {
  return instrument.openStrings.length > 0;
}

export function scaleOutOfRangeMessage(
  instrument: InstrumentProfile,
  extra = "Try one octave on this scale.",
): string {
  return `This range leaves the ${instrument.name.toLowerCase()} span. ${extra}`;
}

export function coachSystemRole(instrument: InstrumentProfile): string {
  return `You are a friendly ${instrument.coach.role} chatting with kids after a scale take.`;
}

export function coachMethodBooksLine(instrument: InstrumentProfile): string {
  const books = instrument.coach.methodBooks.join(" or ");
  return `Books: ${books} only if it really helps.`;
}

export function tunerStringsFor(instrument: InstrumentProfile) {
  return instrument.openStrings.map((s) => ({
    id: s.id,
    pitchClass: s.pitchClass,
    refMidi: s.midi,
  }));
}

/** Sessions written before instrument-aware progress default to violin. */
export function instrumentForSession(session: {
  instrumentId?: string;
}): InstrumentProfile {
  return getInstrument(parseInstrumentId(session.instrumentId));
}

export function instrumentIdFromProgressKey(progressKey: string): InstrumentId {
  const prefix = progressKey.split("__")[0];
  return parseInstrumentId(prefix);
}

export function preferOpenOverFourthExample(
  instrument: InstrumentProfile = getInstrument("violin"),
): string {
  const strings = instrument.openStrings;
  for (let i = 0; i < strings.length - 1; i++) {
    const lower = strings[i]!;
    const higher = strings[i + 1]!;
    if (higher.midi - lower.midi === 7) {
      return `${higher.id}0 not ${lower.id}4`;
    }
  }
  return "next open string over 4th finger";
}
