import { OPEN_STRINGS } from "@/lib/instrument/openStrings";
import type { InstrumentProfile } from "@/lib/instrument/types";

export const VIOLIN_PROFILE: InstrumentProfile = {
  id: "violin",
  name: "Violin",
  openStrings: [OPEN_STRINGS.G, OPEN_STRINGS.D, OPEN_STRINGS.A, OPEN_STRINGS.E],
  clef: "treble",
  staffSystem: "single",
  midiMin: 55,
  midiMax: 100,
  defaultRootOctave: 4,
  defaultTargetMidi: 69,
  pitch: {
    minHz: 80,
    maxHz: 5000,
    practiceMaxHz: 1200,
  },
  coach: {
    role: "violin teacher",
    methodBooks: ["Fiddle Time (Starters, Joggers, Sprinters)"],
  },
  listenSoundfont: "violin",
};

export const VIOLA_PROFILE: InstrumentProfile = {
  id: "viola",
  name: "Viola",
  openStrings: [OPEN_STRINGS.C, OPEN_STRINGS.G, OPEN_STRINGS.D, OPEN_STRINGS.A],
  clef: "alto",
  staffSystem: "single",
  midiMin: 48,
  midiMax: 93,
  defaultRootOctave: 3,
  defaultTargetMidi: 69,
  pitch: {
    minHz: 80,
    maxHz: 5000,
    practiceMaxHz: 900,
  },
  coach: {
    role: "viola teacher",
    methodBooks: ["Viola Time (Starters, Joggers, Sprinters)"],
  },
  listenSoundfont: "viola",
};

/** A0–C8. Scales default to middle C. Treble or bass follows the written notes. */
export const PIANO_PROFILE: InstrumentProfile = {
  id: "piano",
  name: "Piano",
  openStrings: [],
  clef: "treble",
  staffSystem: "grand",
  midiMin: 21,
  midiMax: 108,
  defaultRootOctave: 4,
  defaultTargetMidi: 60,
  pitch: {
    minHz: 27,
    maxHz: 4300,
    practiceMaxHz: 4200,
  },
  coach: {
    role: "piano teacher",
    methodBooks: ["Piano Time (Starters, Joggers, Sprinters)"],
  },
  listenSoundfont: "piano",
};
