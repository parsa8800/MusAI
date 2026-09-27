export type {
  InstrumentCoachCopy,
  InstrumentId,
  ListenSoundfont,
  InstrumentPitchWindow,
  InstrumentProfile,
  NotationClef,
  StaffSystem,
  OpenString,
  OpenStringId,
} from "@/lib/instrument/types";

export {
  DEFAULT_INSTRUMENT_ID,
  INSTRUMENT_IDS,
  INSTRUMENTS,
  allInstruments,
  getInstrument,
  isInstrumentId,
  parseInstrumentId,
} from "@/lib/instrument/catalog";

export { OPEN_STRINGS, openStringById } from "@/lib/instrument/openStrings";
export { PIANO_PROFILE, VIOLA_PROFILE, VIOLIN_PROFILE } from "@/lib/instrument/profiles";

export {
  chromaticNeighborMidi,
  isPlayableMidi,
  midiForPlayableCircleStep,
  nearestPlayableMidiInOctave,
  nearestPlayableMidiWithPitchClass,
  playableNoteOptions,
  playableOctaveBounds,
  playablePitchClassesInOctave,
} from "@/lib/instrument/range";

export {
  fingerLabelRegex,
  stepReference,
  stringFingerLabel,
  type ScaleStepRef,
} from "@/lib/instrument/fingering";

export {
  defaultRootMidi,
  rootsForTonic,
  scaleFitsRange,
  tonicOptionsFor,
  validateScaleMidisInRange,
} from "@/lib/instrument/scale";

export {
  coachMethodBooksLine,
  coachSystemRole,
  hasStringFingering,
  instrumentForSession,
  instrumentIdFromProgressKey,
  openStringListCopy,
  preferOpenOverFourthExample,
  scaleOutOfRangeMessage,
  tunerStringsFor,
  uniqueOpenStrings,
  vexflowClef,
} from "@/lib/instrument/helpers";

export {
  CLEF_GLYPHS,
  CLEF_STAFF,
  clefForNotes,
  clefGlyph,
  type ClefGlyphSpec,
  type ClefStaffGeometry,
} from "@/lib/instrument/notation";

export {
  INSTRUMENT_STORAGE_KEY,
  getActiveInstrument,
  readStoredInstrumentId,
  writeStoredInstrumentId,
} from "@/lib/instrument/storage";
