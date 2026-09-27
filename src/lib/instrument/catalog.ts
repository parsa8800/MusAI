import { PIANO_PROFILE, VIOLA_PROFILE, VIOLIN_PROFILE } from "@/lib/instrument/profiles";
import type { InstrumentId, InstrumentProfile } from "@/lib/instrument/types";

export const DEFAULT_INSTRUMENT_ID: InstrumentId = "violin";

export const INSTRUMENT_IDS = ["violin", "viola", "piano"] as const satisfies readonly InstrumentId[];

export const INSTRUMENTS: Record<InstrumentId, InstrumentProfile> = {
  violin: VIOLIN_PROFILE,
  viola: VIOLA_PROFILE,
  piano: PIANO_PROFILE,
};

export function isInstrumentId(value: unknown): value is InstrumentId {
  return value === "violin" || value === "viola" || value === "piano";
}

export function parseInstrumentId(value: unknown): InstrumentId {
  return isInstrumentId(value) ? value : DEFAULT_INSTRUMENT_ID;
}

export function getInstrument(id: InstrumentId = DEFAULT_INSTRUMENT_ID): InstrumentProfile {
  return INSTRUMENTS[id];
}

/**
 * Add a future instrument by:
 * 1. extending `InstrumentId` and `INSTRUMENT_IDS`
 * 2. adding a profile (strings, clef, range, scale defaults)
 * 3. adding any fingering/notation rules that cannot be derived from the profile
 * Trainers read the profile; they should not grow `if (id === "cello")` branches.
 */
export function allInstruments(): readonly InstrumentProfile[] {
  return INSTRUMENT_IDS.map((id) => INSTRUMENTS[id]);
}
