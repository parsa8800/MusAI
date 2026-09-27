import {
  DEFAULT_INSTRUMENT_ID,
  getInstrument,
  parseInstrumentId,
} from "@/lib/instrument/catalog";
import type { InstrumentId, InstrumentProfile } from "@/lib/instrument/types";

export const INSTRUMENT_STORAGE_KEY = "musai-instrument-v1";

export function readStoredInstrumentId(): InstrumentId {
  if (typeof window === "undefined") return DEFAULT_INSTRUMENT_ID;
  try {
    return parseInstrumentId(window.localStorage.getItem(INSTRUMENT_STORAGE_KEY));
  } catch {
    return DEFAULT_INSTRUMENT_ID;
  }
}

export function writeStoredInstrumentId(id: InstrumentId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(INSTRUMENT_STORAGE_KEY, id);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Current profile. SSR and tests without storage resolve to violin. */
export function getActiveInstrument(): InstrumentProfile {
  return getInstrument(readStoredInstrumentId());
}
