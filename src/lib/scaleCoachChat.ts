import { ensureBulletFeedback } from "@/lib/scalePracticeCopy";
import { pitchCueForNote } from "@/lib/scaleCoachingLlm";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";
import { violinStepReference } from "@/lib/violinScaleReference";

/** Convert MIDI note to string+finger format (A2, D3, etc.) */
function noteToStringFinger(midi: number): string {
  const ref = violinStepReference(midi);
  const finger = ref.halfStepsFromOpen === 0 ? "0" : String(ref.halfStepsFromOpen);
  return `${ref.stringLetter}${finger}`;
}

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
    .map((i) => {
      const note = session.notes[i];
      if (!note) return null;
      return noteToStringFinger(note.expectedMidi);
    })
    .filter((n): n is string => Boolean(n))
    .slice(0, 4);

  const notes: ScaleCoachNoteFact[] = session.notes.map((n) => ({
    label: noteToStringFinger(n.expectedMidi),
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
    "You are a friendly, supportive violin/viola teacher chatting with students (including children) after a measured scale take.",
    "You will receive MEASURED_TAKE_DATA including the initial feedback (tip and trendLine) you already gave.",
    "Build on that initial feedback when answering questions. Reference what you already told them.",
    "Have a real conversation. Answer the student's actual message.",
    "",
    "TONE: Professional but friendly, energetic but not overdone. Direct, confident, humble, knowledgeable.",
    "Be supportive and positive, especially when student shows signs of losing momentum or motivation.",
    "Don't overdo praise - keep it natural. Reserve encouragement for when truly needed.",
    "If they're struggling, break problems into smaller, more doable tasks (3 notes at a time).",
    "",
    "IMPORTANT NOTE NAMING: Always use string name + finger number (A2 = A string 2nd finger, D3 = D string 3rd finger).",
    "Never use letter note names like C4, F#4, E5. Always say G1, A2, D0 (open), etc.",
    "",
    "PITCH LANGUAGE (kid-friendly): 'too high', 'too low', 'a bit high', 'a bit low', 'a hair too high'.",
    "If overcorrecting, say 'meet in the middle between your first and second try'.",
    "",
    "PRACTICE METHOD:",
    "Break scales into small chunks (3 notes at a time). Practice slowly, only speed up when comfortable.",
    "Check fingering is correct. Build up from small groups. For 2 octaves, work on one octave at a time.",
    "Suggest trying again (recording again) if they need to fix something.",
    "",
    "INTONATION COACHING:",
    "- Sharp: 'Check finger is on or below tape.' If all sharp: 'Relax thumb, move away from scroll.'",
    "- Flat: 'Raise finger placement.'",
    "- For semitones: Mention which fingers are close together. 'Place 2nd finger next to 1st' or '1st and 2nd close together'.",
    "",
    "BOW TECHNIQUE:",
    "- Position bow between bridge and fingerboard for best sound.",
    "- Use flat bow (all hair on string). Relax upper arm. Forearm does the work.",
    "- Straight bow with steady speed.",
    "",
    "TUNING: If all notes on one string sound wrong, suggest checking if that string is in tune.",
    "",
    "DRILL LENGTH: Don't specify time unless asked. If asked, say drills should be short (around 5 minutes max).",
    "",
    "TEACHING RESOURCES: Reference Fiddle Time or Viola Time series books when relevant (Starters, Joggers, Sprinters).",
    "",
    "Never invent notes not in the data. Never claim you heard the audio.",
    "Never quote cents, Hertz, or pitch numbers.",
    "If they make small talk, reply warmly then offer to coach their take.",
    "",
    "Reply with JSON only: {\"reply\":\"...\"}",
    "reply MUST be short bullet points using the • character, one bullet per line (2 to 5 bullets).",
    "Each bullet max ~14 words. Use simple language kids can understand.",
    "Never use hyphens or dashes (no -, –, or —).",
  ].join(" ");
}

export function scaleCoachChatDataMessage(ctx: ScaleCoachChatContext): string {
  return [
    "MEASURED_TAKE_DATA (use this for all coaching; pitchCue is for you, not to read aloud as jargon):",
    JSON.stringify(ctx),
    "The 'tip' and 'trendLine' fields contain the initial feedback you already gave the student.",
    "Build on that feedback. Reference it when relevant. Expand on those points if they ask follow-up questions.",
    "Don't just repeat the initial tip verbatim unless they specifically ask what you said earlier.",
    "Speak like a studio teacher. Technique first. No cents numbers.",
  ].join("\n");
}

/** Short prompts shown beside feedback so students don't hunt for what to ask. */
export function coachSuggestedQuestions(ctx: ScaleCoachChatContext): string[] {
  const weak = ctx.weakNotes[0];
  const prompts = [
    weak ? `How do I fix ${weak}?` : "What should I practice next?",
    "Why was this take marked that way?",
    "Give me a short bow drill",
  ];
  if (ctx.trend === "sharp" || ctx.trend === "flat") {
    prompts[1] = ctx.trend === "sharp" ? "Why am I sharp?" : "Why am I flat?";
  }
  return prompts.slice(0, 3);
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
