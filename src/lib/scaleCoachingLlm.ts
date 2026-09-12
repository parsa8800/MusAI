import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";
import { buildScaleCoachingFeedback } from "@/lib/scalePracticeCopy";
import { violinStringFingerLabel } from "@/lib/violinScaleReference";

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
      const midi = session.notes[n.noteIndex]?.expectedMidi ?? 60;
      const stringFingerLabel = violinStringFingerLabel(midi);
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
    "You are a friendly violin/viola teacher helping kids after a scale take.",
    "You only know measured pitch from the recording. You cannot see their hands, bow, or posture. Never claim you saw how they played.",
    "The student already sees coloured notes and arrows on the staff. That is the detailed feedback.",
    "Arrows on the staff mean what to try next: down means play that note lower, up means play it higher.",
    "Your job is a short opener only. Do not lecture. Do not list every note.",
    "Reply with JSON only: {\"trendLine\":\"\",\"tip\":\"...\"}",
    "trendLine must be empty. tip uses • bullets, one per line.",
    "HARD LIMIT: tip = 1 bullet normally. 2 bullets only for a major pattern.",
    "",
    "CLEAN TAKE RULE (very important): If inTunePercent is 90 or higher AND weakNotes is empty, this was excellent.",
    "Then tip is one celebrate line (Every note was right on).",
    "The progress bar fills a little more after each clean complete take, slower as it gets close to full. Do not mention that in the opener.",
    "On a clean take NEVER say mostly right, tape, finger, 3 notes slowly, Work on, percents, or any fix.",
    "",
    "If there ARE a few weak notes:",
    "tip = exactly 1 bullet. Name at most 2 notes as string+finger plus a bit high / a bit low / hard to hear.",
    "Example: D1 was a bit high. Do not add a Try line. The staff already shows the rest.",
    "",
    "MAJOR PATTERN only (2 bullets): almost all notes off, huge error, every note on one string off, or hard to hear.",
    "Stay humble. Never claim you saw thumb, posture, or bow.",
    "Prefer simple kid words. Avoid intonation, bias, placement, technique, noticeably, centred.",
    "",
    "NOTE NAMES: string + finger only. Prefer E0 not A4. Never C4 or F#4.",
    "",
    "Each bullet max ~12 easy words. No paragraphs. No markdown.",
    "Never use hyphens or dashes (no -, –, or —).",
    "Use only the measured facts. Do not invent notes.",
  ].join(" ");
}
