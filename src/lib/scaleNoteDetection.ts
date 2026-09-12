/**
 * Scale Studio note-detection contract.
 *
 * Keep these three ideas separate:
 *
 * - expectedScaleNotes — MIDI the player is supposed to play
 * - detectedNotes      — stable pitch runs with enough audio evidence,
 *                        matched onto expected slots
 * - feedback           — intonation for matched slots only
 *
 * Never invent a detected note (or tuning feedback) just because a pitch
 * belongs to the expected scale. Unplayed expected notes stay missing.
 */
export {
  DETECTED_NOTE_MATCH_MAX_CENTS,
  DETECTED_NOTE_MAX_SKIP,
  collectStablePitchRuns,
  matchDetectedRunsToExpected,
  medianHzPerScaleSteps,
  runFitsExpectedMidi,
  type StablePitchRun,
} from "@/lib/analyzePitch";
export {
  analyzeScaleFromFrames,
  analyzeScalePerformance,
  listDetectedNoteLabels,
} from "@/lib/analyzeScalePerformance";
