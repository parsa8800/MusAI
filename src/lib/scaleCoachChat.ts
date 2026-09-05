import { ensureBulletFeedback } from "@/lib/scalePracticeCopy";
import { pitchCueForNote } from "@/lib/scaleCoachingLlm";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";

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
};

export function buildScaleCoachChatContext(
  session: ScalePracticeSessionV1,
  tip: string,
  trendLine: string,
): ScaleCoachChatContext {
  const weak = session.summary.weakestNoteIndices
    .map((i) => session.notes[i]?.expectedNoteLabel)
    .filter((n): n is string => Boolean(n))
    .slice(0, 4);

  const notes: ScaleCoachNoteFact[] = session.notes.map((n) => ({
    label: n.expectedNoteLabel,
    pitchCue: pitchCueForNote({
      missing: n.missingData,
      bucket: n.intonationBucket,
      cents: n.missingData ? null : Math.round(n.centsDifference),
    }),
    bucket: n.intonationBucket,
    missing: n.missingData,
  }));

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
  };
}

export function scaleCoachChatSystemPrompt(): string {
  return [
    "You are a violin teacher chatting after one measured scale take.",
    "You will receive MEASURED_TAKE_DATA (facts from pitch analysis) and a short TEMPLATE tip.",
    "Have a real conversation. Answer the student's actual message.",
    "If they ask how your day is or make small talk, reply warmly in bullets, then offer to coach the take.",
    "If they ask how to improve technique or accuracy, give violin pedagogy: soft thumb on the neck,",
    "light fingertip placement, settle the pitch before moving, full bow hair on the string,",
    "steady bow speed, slower bows on weak notes, listen then adjust.",
    "Ground drills in measured notes using pitchCue (slightly_sharp, unclear_sound, etc.), trend, and score.",
    "Never invent notes that are not in the data. Never claim you heard the audio.",
    "Never quote cents, Hertz, or numeric pitch offsets. Never say lower it by N cents.",
    "For unclear_sound or missing notes, coach tone clarity and contact, not intonation numbers.",
    "Never ignore the user's question to dump the template tip.",
    "Reply with JSON only: {\"reply\":\"...\"}",
    "reply MUST be short bullet points using the • character, one bullet per line (2 to 5 bullets).",
    "Each bullet max ~14 words. Never use hyphens or dashes (no -, –, or —).",
  ].join(" ");
}

export function scaleCoachChatDataMessage(ctx: ScaleCoachChatContext): string {
  return [
    "MEASURED_TAKE_DATA (use this for all coaching; pitchCue is for you, not to read aloud as jargon):",
    JSON.stringify(ctx),
    "TEMPLATE tip is a starting hint only. Do not paste it unless it answers their question.",
    "Speak like a studio teacher. Technique first. No cents numbers.",
  ].join("\n");
}

/** Local conversational replies when no LLM key is available. */
export function localCoachChatReply(
  question: string,
  ctx: ScaleCoachChatContext,
): string {
  const q = question.toLowerCase().trim();
  const weak = ctx.weakNotes.slice(0, 2).join(" & ") || "the coloured notes";

  if (
    /^(ok|okay|k|cool|nice|great|thanks|thank you|ty|thx|cheers|got it|perfect|awesome|sweet)[\s!.]*$/i.test(
      q,
    ) ||
    /\b(thanks|thank you|thx|ty)\b/.test(q)
  ) {
    return ensureBulletFeedback(
      [
        "You're welcome",
        `Ask how to practice ${weak}`,
        "Or ask what the score means",
      ].join("\n"),
    );
  }

  if (
    /\b(how (is|are|was) (your|the) day|how's it going|how are you|whats up|what's up)\b/.test(
      q,
    ) ||
    /^(hi|hey|hello|yo)\b/.test(q)
  ) {
    return ensureBulletFeedback(
      [
        "Pretty good, thanks for asking",
        "I have your measured take ready",
        `Ask how to fix ${weak} when you want`,
      ].join("\n"),
    );
  }

  const noteHit = q.match(/\b([a-g](?:#|b|♯|♭)?\d)\b/i);
  if (noteHit) {
    const note = noteHit[1]!.toUpperCase().replace("♯", "#").replace("♭", "b");
    const fact = ctx.notes.find(
      (n) => n.label.toUpperCase().replace("♯", "#").replace("♭", "b") === note,
    );
    if (fact?.missing || fact?.pitchCue === "unclear_sound") {
      return ensureBulletFeedback(
        [
          `${note} sounded unclear`,
          "Use more bow hair on the string",
          "One slow bow, then replay",
        ].join("\n"),
      );
    }
    const high =
      fact?.pitchCue.includes("sharp") || fact?.pitchCue.includes("high");
    return ensureBulletFeedback(
      [
        high
          ? `${note} ran high, soften the thumb`
          : `${note} sat low, place a touch higher`,
        `Play ${note} alone with one slow bow`,
        "Settle the pitch before moving on",
      ].join("\n"),
    );
  }

  if (
    /\b(technique|thumb|bow|hair|posture|left hand|finger)\b/.test(q) ||
    /\b(how (do|to|can|should) i|practice plan|what should i (practice|work)|drill|improve|fix|accuracy)\b/.test(
      q,
    )
  ) {
    const unclear = ctx.notes.some(
      (n) => n.missing || n.pitchCue === "unclear_sound",
    );
    if (unclear) {
      return ensureBulletFeedback(
        [
          "Some notes were unclear",
          "Keep full bow hair on the string",
          `Isolate ${weak} with slow bows`,
        ].join("\n"),
      );
    }
    return ensureBulletFeedback(
      [
        `Focus on ${weak}`,
        "Keep the thumb soft on the neck",
        "Settle each pitch before you move",
      ].join("\n"),
    );
  }

  if (/\b(sharp|flat)\b/.test(q) || /\b(too high|too low)\b/.test(q)) {
    return ensureBulletFeedback(
      [
        ctx.trendLine,
        ctx.trend === "sharp"
          ? "Lighten fingers and soften the thumb"
          : "Place a touch higher and listen",
        `Focus on ${weak} first`,
      ].join("\n"),
    );
  }

  if (/\b(score|rating|grade|what does .* mean)\b/.test(q)) {
    return ensureBulletFeedback(
      [
        `Score ${ctx.score}/100 from pitch closeness`,
        `${ctx.inTunePercent}% of notes were near pitch`,
        `Work ${weak} next`,
      ].join("\n"),
    );
  }

  if (/\b(why|explain|which notes|weak)\b/.test(q)) {
    return ensureBulletFeedback(
      [
        ctx.trendLine,
        `Weak spots: ${weak}`,
        "Ask how to practice one of those notes",
      ].join("\n"),
    );
  }

  return ensureBulletFeedback(
    [
      "I can coach from this take's measured notes",
      `Try: how do I fix ${weak}?`,
      "Or: what should I practice next?",
    ].join("\n"),
  );
}
