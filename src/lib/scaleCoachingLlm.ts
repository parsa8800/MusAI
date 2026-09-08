import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";
import { buildScaleCoachingFeedback } from "@/lib/scalePracticeCopy";
import { violinStepReference } from "@/lib/violinScaleReference";

/** Convert letter note name (C4, E5) to string+finger format (A2, D3) */
function noteToStringFinger(midi: number): string {
  const ref = violinStepReference(midi);
  const finger = ref.halfStepsFromOpen === 0 ? "0" : String(ref.halfStepsFromOpen);
  return `${ref.stringLetter}${finger}`;
}

/** Compact measured facts for an LLM — no audio, no secrets. */
export type ScaleCoachingLlmPayload = {
  scaleLabel: string;
  score: number;
  inTunePercent: number;
  averageAbsCents: number;
  trend: ScalePracticeSessionV1["summary"]["trend"];
  weakNotes: Array<{
    label: string;
    pitchCue: string;
    bucket: string;
  }>;
  templateTip: string;
  templateTrend: string;
};

/** Coarse cue for coaching — never expose raw cents to the student. */
export function pitchCueForNote(input: {
  missing: boolean;
  bucket: string;
  cents: number | null;
}): string {
  if (input.missing) return "unclear_sound";
  if (input.bucket === "in_tune") return "on_pitch";
  const abs = Math.abs(input.cents ?? 0);
  const high = input.bucket === "sharp" || (input.cents ?? 0) > 0;
  if (abs >= 100) return high ? "far_too_high" : "far_too_low";
  if (abs >= 35) return high ? "noticeably_sharp" : "noticeably_flat";
  return high ? "slightly_sharp" : "slightly_flat";
}

export function buildScaleCoachingLlmPayload(
  session: ScalePracticeSessionV1,
): ScaleCoachingLlmPayload {
  const coaching = buildScaleCoachingFeedback(session);
  return {
    scaleLabel: session.scaleLabel,
    score: session.summary.overallScore0to100,
    inTunePercent: session.summary.inTunePercent,
    averageAbsCents: session.summary.averageAbsCents,
    trend: session.summary.trend,
    weakNotes: coaching.focusNotes.map((n) => {
      const cents =
        n.centsLabel === "—"
          ? null
          : Number.parseFloat(n.centsLabel.replace("¢", ""));
      // Convert note label to string+finger format (A2, D3, etc.)
      const midi = session.notes[n.index]?.expectedMidi ?? 60;
      const stringFingerLabel = noteToStringFinger(midi);
      return {
        label: stringFingerLabel,
        pitchCue: pitchCueForNote({
          missing: n.centsLabel === "—",
          bucket: n.bucket,
          cents: Number.isFinite(cents) ? cents : null,
        }),
        bucket: n.bucket,
      };
    }),
    templateTip: coaching.tip,
    templateTrend: coaching.trendLine,
  };
}

export function scaleCoachingSystemPrompt(): string {
  return [
    "You are a friendly violin/viola teacher giving post-practice feedback to students (including children).",
    "The student already sees colour-coded notes on a staff (green/yellow/red).",
    "Reply with JSON only: {\"trendLine\":\"...\",\"tip\":\"...\"}",
    "Both trendLine and tip MUST be short bullet lists using the • character, one bullet per line.",
    "trendLine: 1 or 2 bullets about sharp/flat/centred bias in simple language kids understand.",
    "tip: 2 or 3 bullets naming the worst notes (using string+finger format like A2, D3) and one technique fix each.",
    "",
    "IMPORTANT NOTE NAMING: Always use string name + finger number (A2 = A string 2nd finger, D3 = D string 3rd finger).",
    "Never use letter note names like C4, F#4, E5. Always say G1, A2, D0 (open string), etc.",
    "",
    "PITCH LANGUAGE (kid-friendly): Say 'too high', 'too low', 'a bit high', 'a bit low', 'a hair too high'.",
    "If they overcorrect, say 'meet in the middle between your first try and this one'.",
    "",
    "INTONATION FIXES:",
    "- Sharp notes: 'Check finger is on or below the tape, not above the line.' If all notes sharp: 'Thumb is tense, relax it and move away from scroll toward first finger position.'",
    "- Flat notes: 'Raise the finger placement.'",
    "- For semitones (close fingers): Mention which fingers should be next to each other. Example: '1st and 2nd finger close together' or 'Place 2nd finger next to 1st.'",
    "",
    "BOW & TONE FIXES:",
    "- Unclear tone: 'Use flat bow with all hair on string. Keep bow between bridge and fingerboard. Relax upper arm, let forearm do the work.'",
    "- Scratchy sound: 'Bow too close to bridge, move toward fingerboard.'",
    "- Weak sound: 'Bow too close to fingerboard, move toward bridge.'",
    "",
    "ENCOURAGEMENT: Be supportive and friendly, but don't overdo positivity. Reserve praise for real progress.",
    "If they're close, let them know. If losing momentum, break problems into smaller tasks and be energizing.",
    "",
    "Each bullet max ~14 words. Use simple language. No paragraphs. No markdown.",
    "Never use hyphens or dashes (no -, –, or —). Use commas or new bullets instead.",
    "Use only the measured facts provided. Do not invent notes.",
  ].join(" ");
}

