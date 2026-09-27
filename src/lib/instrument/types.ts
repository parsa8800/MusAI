export type InstrumentId = "violin" | "viola" | "piano";

export type NotationClef = "treble" | "alto" | "bass";

/** One staff, or treble-and-bass chosen from the written register. */
export type StaffSystem = "single" | "grand";

export type OpenStringId = "C" | "G" | "D" | "A" | "E";

export type OpenString = {
  id: OpenStringId;
  pitchClass: number;
  midi: number;
};

export type InstrumentPitchWindow = {
  minHz: number;
  maxHz: number;
  /** Lower than midiMax — cuts false harmonic highs in scale/piece takes. */
  practiceMaxHz: number;
};

export type InstrumentCoachCopy = {
  role: string;
  methodBooks: readonly string[];
};

/** GM soundfont name used when Piece Listen plays this instrument. */
export type ListenSoundfont = "violin" | "viola" | "piano";

/**
 * Shared instrument profile. Studios should read these fields
 * (or helpers that take a profile) instead of branching on id.
 */
export type InstrumentProfile = {
  id: InstrumentId;
  name: string;
  /** Empty for keyboard instruments — no open-string tuner or fingering. */
  openStrings: readonly OpenString[];
  clef: NotationClef;
  staffSystem: StaffSystem;
  midiMin: number;
  midiMax: number;
  defaultRootOctave: number;
  defaultTargetMidi: number;
  pitch: InstrumentPitchWindow;
  coach: InstrumentCoachCopy;
  listenSoundfont: ListenSoundfont;
};
