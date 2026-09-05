import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";
import { buildScaleCoachingFeedback } from "@/lib/scalePracticeCopy";

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
      return {
        label: n.label,
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
    "You are a concise violin teacher giving post-practice feedback.",
    "The student already sees colour-coded notes on a staff (green/yellow/red).",
    "Reply with JSON only: {\"trendLine\":\"...\",\"tip\":\"...\"}",
    "Both trendLine and tip MUST be short bullet lists using the • character, one bullet per line.",
    "trendLine: 1 or 2 bullets about sharp/flat/centred bias in plain musician language.",
    "tip: 2 or 3 bullets naming the worst notes and one violin technique fix each.",
    "Prefer left-hand and bow cues: soft thumb on the neck, light finger drop, settle before shifting,",
    "full bow hair on the string, steady bow speed, one slow bow per note, listen then adjust.",
    "If a note is unclear or missing, coach contact and clarity (more hair, slower bow, quieter room), not pitch cents.",
    "Never quote cents, Hertz, or numeric pitch offsets to the student.",
    "Say slightly high/low or quite sharp/flat instead of numbers.",
    "Each bullet max ~12 words. No paragraphs. No markdown. No praise fluff.",
    "Never use hyphens or dashes (no -, –, or —). Use commas or new bullets instead.",
    "Use only the measured facts provided. Do not invent notes.",
  ].join(" ");
}

