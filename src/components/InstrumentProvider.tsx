"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_INSTRUMENT_ID,
  getInstrument,
  parseInstrumentId,
  readStoredInstrumentId,
  writeStoredInstrumentId,
  INSTRUMENT_STORAGE_KEY,
} from "@/lib/instrument";
import type { InstrumentId, InstrumentProfile } from "@/lib/instrument";

type InstrumentContextValue = {
  instrumentId: InstrumentId;
  instrument: InstrumentProfile;
  setInstrumentId: (id: InstrumentId) => void;
};

const InstrumentContext = createContext<InstrumentContextValue | null>(null);

export function InstrumentProvider({ children }: { children: ReactNode }) {
  const [instrumentId, setInstrumentIdState] = useState<InstrumentId>(
    DEFAULT_INSTRUMENT_ID,
  );

  useEffect(() => {
    const stored = readStoredInstrumentId();
    setInstrumentIdState(stored);
    document.documentElement.dataset.instrument = stored;
  }, []);

  useEffect(() => {
    document.documentElement.dataset.instrument = instrumentId;
  }, [instrumentId]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== INSTRUMENT_STORAGE_KEY) return;
      const next = parseInstrumentId(event.newValue);
      setInstrumentIdState(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setInstrumentId = useCallback((id: InstrumentId) => {
    writeStoredInstrumentId(id);
    setInstrumentIdState(id);
    document.documentElement.dataset.instrument = id;
  }, []);

  const value = useMemo<InstrumentContextValue>(
    () => ({
      instrumentId,
      instrument: getInstrument(instrumentId),
      setInstrumentId,
    }),
    [instrumentId, setInstrumentId],
  );

  return (
    <InstrumentContext.Provider value={value}>
      {children}
    </InstrumentContext.Provider>
  );
}

/** Falls back to the stored/default profile when no provider is mounted. */
export function useInstrument(): InstrumentContextValue {
  const ctx = useContext(InstrumentContext);
  if (ctx) return ctx;

  const instrumentId = readStoredInstrumentId();
  return {
    instrumentId,
    instrument: getInstrument(instrumentId),
    setInstrumentId: writeStoredInstrumentId,
  };
}
