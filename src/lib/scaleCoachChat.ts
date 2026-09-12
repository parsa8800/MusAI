import { ensureBulletFeedback } from "@/lib/scalePracticeCopy";
import { pitchCueForNote } from "@/lib/scaleCoachingLlm";
import { buildLoopMastery } from "@/lib/scalePracticeProgress";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";
import { violinStringFingerLabel } from "@/lib/violinScaleReference";

export type CoachChatMessage = {
  role: "user" | "assistant";
  text: string;
};

export type ScaleCoachNoteFact = {
  label: string;
  pitchCue: string;
  bucket: string;
  missing: boolean;
};

export type ScaleCoachChatContext = {
  scaleLabel: string;
  scaleKind: string;
  octaveSpan: number;
  rangeLabel: string;
  score: number;
  inTunePercent: number;
  averageAbsCents: number;
  meanSignedCents: number;
  trend: ScalePracticeSessionV1["summary"]["trend"];
  notesAnalyzed: number;
  notesMissing: number;
  weakNotes: string[];
  notes: ScaleCoachNoteFact[];
  tip: string;
  trendLine: string;
  /** Consecutive fully in-tune takes at the end of this loop. */
  greatStreak: number;
  /** Great takes in a row needed to fill the progress bar. */
  greatTakesNeeded: number;
  barFull: boolean;
};

export function buildScaleCoachChatContext(
  session: ScalePracticeSessionV1,
  tip: string,
  trendLine: string,
  loopAttempts: ScalePracticeSessionV1[] = [session],
): ScaleCoachChatContext {
  const weak = session.summary.weakestNoteIndices
    .map((i) => session.notes[i])
    .filter(
      (note): note is NonNullable<typeof note> =>
        Boolean(note) &&
        (note.missingData || note.intonationBucket !== "in_tune"),
    )
    .map((note) => violinStringFingerLabel(note.expectedMidi))
    .filter((n, i, arr) => arr.indexOf(n) === i)
    .slice(0, 4);

  const notes: ScaleCoachNoteFact[] = session.notes.map((n) => ({
    label: violinStringFingerLabel(n.expectedMidi),
    pitchCue: pitchCueForNote({
      missing: n.missingData,
      bucket: n.intonationBucket,
      cents: n.missingData ? null : Math.round(n.centsDifference),
    }),
    bucket: n.intonationBucket,
    missing: n.missingData,
  }));

  const attempts = loopAttempts.length > 0 ? loopAttempts : [session];
  const mastery = buildLoopMastery(attempts);

  return {
    scaleLabel: session.scaleLabel,
    scaleKind: session.scaleKind,
    octaveSpan: session.octaveSpan,
    rangeLabel: session.octaveRangeLabel,
    score: session.summary.overallScore0to100,
    inTunePercent: session.summary.inTunePercent,
    averageAbsCents: Math.round(session.summary.averageAbsCents),
    meanSignedCents: Math.round(session.summary.meanSignedCents),
    trend: session.summary.trend,
    notesAnalyzed: session.summary.notesAnalyzed,
    notesMissing: session.summary.notesMissing,
    weakNotes: weak,
    notes,
    tip,
    trendLine,
    greatStreak: mastery.greatStreak,
    greatTakesNeeded: mastery.needed,
    barFull: mastery.percent >= 100,
  };
}

export function scaleCoachChatSystemPrompt(): string {
  return [
    "You are a friendly violin/viola teacher chatting with kids after a scale take.",
    "You only know measured pitch. You cannot see how they played. Never pretend you watched them.",
    "The coloured notes on the staff are the detailed feedback. You already gave a short opener in tip/trendLine.",
    "Staff arrows mean the fix: down = play that note lower next time, up = play it higher.",
    "Answer their real question. Do not dump the take or the opener again unless they ask.",
    "Drills, tape, posture, thumb, and bow help only when they ask.",
    "",
    "PROGRESS BAR (for you, not to lecture): The bar is longer-term mastery of this scale, not this take’s score.",
    "It rises when they play better. Gains get smaller as the bar gets close to full. One weaker take barely moves it down.",
    "Several weaker takes in a row can ease it down a little. barFull means the bar is full.",
    "A fully correct clean take can fill the bar right away. Partial or improving takes still climb step by step.",
    "Do not quote percents. Do not invent a take count to fill the bar.",
    "",
    "TONE: Warm, plain, humble. Short sentences. Words a child knows.",
    "Avoid hard words: intonation, bias, technique, placement, noticeably, centred, accuracy.",
    "Say what the take showed, then offer a try. Do not diagnose like a doctor.",
    "If cause is unclear, ask a simple question: Did it sound scratchy? Was the finger on the tape?",
    "CLEAN TAKE: If inTunePercent is 90+ and weakNotes is empty, only celebrate. Never say tape, 3 notes slowly, or fix tips.",
    "If they ask for a drill, shrink the job: 3 notes at a time, slow bows, then record again.",
    "",
    "NOTE NAMES: string + finger only (A2, D0). Prefer next open string over 4th finger (E0 not A4). Never C4.",
    "PITCH WORDS: too high, too low, a bit high, a bit low, hard to hear, mostly right.",
    "",
    "GENTLE TRIES (only when they ask, not sure diagnoses):",
    "Too high: Try the finger on or below the tape.",
    "Too low: Try the finger a little higher.",
    "Hard to hear: Try flat bow hair on the string, between bridge and fingerboard.",
    "Close fingers (semitones): Try 1st and 2nd next to each other when that fits.",
    "All notes on one string off: Maybe check if that string is in tune.",
    "",
    "Books: Fiddle Time or Viola Time (Starters, Joggers, Sprinters) only if it really helps.",
    "Never invent notes. Never claim you heard the audio waveform. Never quote cents, Hertz, or percents.",
    "Small talk: reply warmly, then offer to help with the take.",
    "",
    "Reply with JSON only: {\"reply\":\"...\"}",
    "reply: 1 • bullet. 2 only if they asked how to practise. Each max ~10 easy words. No hyphens or dashes.",
  ].join(" ");
}

export function scaleCoachChatDataMessage(ctx: ScaleCoachChatContext): string {
  return [
    "MEASURED_TAKE_DATA (pitchCue is for you; do not read jargon aloud):",
    JSON.stringify(ctx),
    "tip and trendLine are the short opener you already told them. Do not dump them again unless asked.",
    "The staff colours already show each note. Answer their question. Offer drills only if they ask.",
    "greatStreak is extra context. Do not quote percents or say they must play a set number of times.",
  ].join("\n");
}

/** Short tap-prompts from this take, so they do not have to think of a question. */
export function coachSuggestedQuestions(ctx: ScaleCoachChatContext): string[] {
  const out: string[] = [];
  const weak = ctx.weakNotes[0];
  const fact = weak
    ? ctx.notes.find((n) => n.label === weak)
    : undefined;
  const clean = ctx.inTunePercent >= 90 && ctx.weakNotes.length === 0;

  if (clean) {
    if (!ctx.barFull) out.push("How do I fill the bar?");
    out.push("What should I try next?");
    return out.slice(0, 2);
  }

  if (fact?.missing || fact?.pitchCue === "unclear_sound") {
    out.push(`Why was ${weak} hard to hear?`);
    out.push("How can I bow more clearly?");
  } else if (weak) {
    out.push(`How do I fix ${weak}?`);
    const high =
      fact?.pitchCue.includes("sharp") || fact?.pitchCue.includes("high");
    out.push(high ? "Why was it high?" : "Why was it low?");
  }

  if (ctx.notesMissing > 0 && !out.some((q) => /hear/.test(q))) {
    out.unshift("Why was it hard to hear?");
  }

  return [...new Set(out)].slice(0, 3);
}

/** Local conversational replies when no LLM key is available. */
export function localCoachChatReply(
  question: string,
  ctx: ScaleCoachChatContext,
): string {
  const q = question.toLowerCase().trim();
  const weak = ctx.weakNotes.slice(0, 2).join(" & ") || "the coloured notes";
  const clean = ctx.inTunePercent >= 90 && ctx.weakNotes.length === 0;

  if (
    /^(ok|okay|k|cool|nice|great|thanks|thank you|ty|thx|cheers|got it|perfect|awesome|sweet)[\s!.]*$/i.test(
      q,
    ) ||
    /\b(thanks|thank you|thx|ty)\b/.test(q)
  ) {
    return ensureBulletFeedback("You're welcome");
  }

  if (
    /\b(how (is|are|was) (your|the) day|how's it going|how are you|whats up|what's up)\b/.test(
      q,
    ) ||
    /^(hi|hey|hello|yo)\b/.test(q)
  ) {
    return ensureBulletFeedback("Pretty good. Ask if you want help");
  }

  if (
    /\b(3 times in a row|three times in a row|play it 3 times|fill the bar|progress bar|what should i try next|keep this)\b/.test(
      q,
    )
  ) {
    if (ctx.barFull) {
      return ensureBulletFeedback("The bar is full. Keep that sound");
    }
    if (clean) {
      return ensureBulletFeedback("One clean full take fills the bar. Play every note in tune");
    }
    return ensureBulletFeedback("Play every note in tune to fill the bar");
  }

  if (clean && /\b(how (do|to|can|should) i|fix|drill|improve)\b/.test(q)) {
    return ensureBulletFeedback("Play it that well again");
  }

  // String+finger (A2, D0) or letter+octave (C4) so either style of question works.
  const fingerHit = q.match(/\b([gdae])([0-4])\b/i);
  const noteHit = q.match(/\b([a-g](?:#|b|♯|♭)?\d)\b/i);
  if (fingerHit || noteHit) {
    const asked = (fingerHit
      ? `${fingerHit[1]!.toUpperCase()}${fingerHit[2]!}`
      : noteHit![1]!.toUpperCase().replace("♯", "#").replace("♭", "b"))!;
    const fact = ctx.notes.find((n) => {
      const label = n.label.toUpperCase().replace("♯", "#").replace("♭", "b");
      return label === asked;
    });
    if (fact?.missing || fact?.pitchCue === "unclear_sound") {
      return ensureBulletFeedback(
        `${asked} was hard to hear. Try a slow bow`,
      );
    }
    const high =
      fact?.pitchCue.includes("sharp") || fact?.pitchCue.includes("high");
    return ensureBulletFeedback(
      high
        ? `${asked} was a bit high. Try the finger on the tape`
        : `${asked} was a bit low. Try the finger a little higher`,
    );
  }

  if (
    /\b(technique|thumb|bow|hair|posture|left hand|finger|tape|scratchy|feel)\b/.test(q) ||
    /\b(how (do|to|can|should) i|practice plan|what should i (practice|work)|drill|improve|fix|accuracy)\b/.test(
      q,
    )
  ) {
    const unclear = ctx.notes.some(
      (n) => n.missing || n.pitchCue === "unclear_sound",
    );
    if (unclear) {
      return ensureBulletFeedback(`Try a slow bow on ${weak}`);
    }
    return ensureBulletFeedback(
      ctx.trend === "sharp"
        ? `Try ${weak} on the tape`
        : `Try ${weak} a little higher`,
    );
  }

  if (/\b(sharp|flat)\b/.test(q) || /\b(too high|too low)\b/.test(q)) {
    return ensureBulletFeedback(
      ctx.trend === "sharp"
        ? `${weak} was a bit high. Try the tape`
        : `Try ${weak} a little higher`,
    );
  }

  if (/\b(score|rating|grade|what does .* mean)\b/.test(q)) {
    return ensureBulletFeedback("Look at the coloured notes");
  }

  if (/\b(why|explain|which notes|weak)\b/.test(q)) {
    return ensureBulletFeedback(`Look at ${weak} on the coloured notes`);
  }

  return ensureBulletFeedback("Ask about a note if you want help");
}
