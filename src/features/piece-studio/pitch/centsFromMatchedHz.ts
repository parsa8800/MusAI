import { preferFundamentalNearTargetHz } from "@/lib/analyzePitch";
import { centsFromTarget, midiToHz } from "@/lib/intonation";
import { unwrapOctaveCents } from "@/lib/intonationScore";

/** Shared note-level cents from a matched Hz slot (performance + PitchAnalyzer). */
export function centsFromMatchedHz(
  hz: number,
  expectedMidi: number,
): { detectedHz: number; cents: number } {
  const target = midiToHz(expectedMidi);
  const detectedHz = preferFundamentalNearTargetHz(hz, target);
  const cents = unwrapOctaveCents(centsFromTarget(detectedHz, target));
  return { detectedHz, cents };
}
