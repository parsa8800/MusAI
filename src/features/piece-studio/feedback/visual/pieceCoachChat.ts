import type { PieceCoachIssueView } from "@/features/piece-studio/feedback/visual/pieceCoachIssueView";
import { pieceCoachPlaceLine } from "@/features/piece-studio/feedback/visual/pieceCoachIssueView";

/** Teaching priority: pitch first, then rhythm, tempo, dynamics. */
const TOPIC_PRIORITY: Record<string, number> = {
  pitch: 0,
  rhythm: 1,
  tempo: 2,
  rushing: 2,
  dragging: 2,
  dynamics: 3,
  consistency: 4,
};

function topicRank(issue: PieceCoachIssueView): number {
  if (issue.category === "tempo") return TOPIC_PRIORITY.tempo ?? 2;
  return TOPIC_PRIORITY[issue.category] ?? 9;
}

function severityRank(issue: PieceCoachIssueView): number {
  if (issue.severity === "focus") return 0;
  if (issue.severity === "secondary") return 1;
  return 2;
}

/** Order issues the way a teacher would — pitch before tempo, focus before secondary. */
export function prioritizePieceCoachIssues(
  issues: readonly PieceCoachIssueView[],
): PieceCoachIssueView[] {
  return [...issues].sort((a, b) => {
    const topic = topicRank(a) - topicRank(b);
    if (topic !== 0) return topic;
    return severityRank(a) - severityRank(b);
  });
}

/**
 * Opening coach message after a take (or sample).
 * The lesson card already shows the take — keep chat empty until they ask.
 */
export function pieceCoachOpenerText(
  _issues: readonly PieceCoachIssueView[],
): string {
  void _issues;
  return "";
}

/** Score facts the student can ask about before they record. */
export type PieceAskContext = {
  title: string;
  composer: string | null;
  keySignature: string | null;
  timeSignature: string | null;
  tempoBpm: number | null;
  measureCount: number;
};

/** Prompts about the written piece. The chat shows a few that have not been asked yet. */
export function pieceAskSuggestions(ctx: PieceAskContext): string[] {
  const prompts = ["What key is this?"];
  if (ctx.timeSignature) prompts.push("What time is this?");
  prompts.push(ctx.tempoBpm != null ? "How fast is it?" : "How fast should I play this?");
  prompts.push("Where should I start?");
  if (ctx.measureCount > 0) prompts.push("How many bars is it?");
  if (ctx.composer) prompts.push("Who wrote this?");
  prompts.push("How should I practise the opening?");
  return prompts;
}

function pieceFactLine(ctx: PieceAskContext): string | null {
  const bits = [
    ctx.keySignature ? `in ${ctx.keySignature}` : null,
    ctx.timeSignature,
    ctx.tempoBpm != null ? `around ${Math.round(ctx.tempoBpm)}` : null,
  ].filter((bit): bit is string => Boolean(bit));
  if (bits.length === 0) return null;
  return `${ctx.title} is ${bits.join(", ")}.`;
}

/**
 * Answers about the written piece. A recorded take is optional context,
 * never a requirement to chat.
 */
export function localPieceAskReply(
  question: string,
  ctx: PieceAskContext,
  issue: PieceCoachIssueView | null = null,
  allIssues: readonly PieceCoachIssueView[] = [],
): string {
  const q = question.toLowerCase().trim();

  if (
    /^(ok|okay|k|cool|nice|great|thanks|thank you|ty|thx|cheers|got it|perfect|awesome|sweet)[\s!.]*$/i.test(
      q,
    ) ||
    /\b(thanks|thank you|thx)\b/.test(q)
  ) {
    return "• You're welcome.";
  }

  if (/^(hi|hey|hello|yo)\b/.test(q)) {
    return "• Ask about the piece anytime. You don't need to record first.";
  }

  if (/\bkey\b|key signature|what key/.test(q)) {
    return ctx.keySignature
      ? `• ${ctx.title} is in ${ctx.keySignature}.`
      : "• The key isn’t written on this score. Look at the signature beside the clef.";
  }

  if (/\b(time signature|what time|the time|meter)\b/.test(q)) {
    return ctx.timeSignature
      ? `• The time is ${ctx.timeSignature}.`
      : "• The time signature isn’t marked on this score.";
  }

  if (/\b(tempo|how fast|what speed|bpm|allegro|adagio|andante)\b/.test(q)) {
    if (ctx.tempoBpm != null) {
      return `• The written tempo is about ${Math.round(ctx.tempoBpm)}.\n• Start slower until the notes are clear, then bring it up.`;
    }
    return "• Start at a speed where every note is clear, then bring it up.";
  }

  if (/\b(how many bars|how many measures|how long|measure count)\b/.test(q)) {
    return ctx.measureCount > 0
      ? `• There are ${ctx.measureCount} bars.`
      : "• The bar count isn’t on this score yet.";
  }

  if (/\b(who wrote|composer|what piece|what is this)\b/.test(q)) {
    return ctx.composer
      ? `• ${ctx.composer} — ${ctx.title}.`
      : `• This is ${ctx.title}.`;
  }

  if (
    /\b(where (should|do) i start|how (do|should) i (practise|practice|begin|start)|where to start)\b/.test(
      q,
    )
  ) {
    const place = ctx.measureCount > 8 ? "the opening phrase" : "the opening";
    return `• Start with ${place} and play it slowly.\n• Loop a short bit until it feels easy. You can record whenever you want notes on your playing.`;
  }

  if (issue && /\b(why|what|how|practise|practice|where|next|fix|sharp|flat)\b/.test(q)) {
    return localPieceCoachReply(
      question,
      issue,
      allIssues.length > 0 ? allIssues : [issue],
    );
  }

  if (/\b(my playing|my take|was i|did i|am i in tune)\b/.test(q)) {
    return "• Record a take when you want notes on your playing.\n• You can still ask about the key, the tempo, or where to start.";
  }

  const fact = pieceFactLine(ctx);
  return fact
    ? `• ${fact}\n• Ask about the key, the tempo, or where to start.`
    : "• Ask about the key, the tempo, or where to start.";
}

/** @deprecated Prefer {@link pieceCoachOpenerText} with the full issue list. */
export function pieceCoachIssueOpener(_issue: PieceCoachIssueView): string {
  void _issue;
  return "";
}

export function pieceCoachSuggestedQuestions(
  issue: PieceCoachIssueView,
): string[] {
  const place = issue.where.trim();
  return [
    place ? `Why is ${place} hard?` : "Why is this hard?",
    "How do I practise this?",
    "What should I work on next?",
  ];
}

/**
 * Local Piece coach replies grounded in the focused issue, with take-wide
 * priority when the student asks what to do next.
 */
export function localPieceCoachReply(
  question: string,
  issue: PieceCoachIssueView,
  allIssues: readonly PieceCoachIssueView[] = [issue],
): string {
  const q = question.toLowerCase();
  if (
    q.includes("next") ||
    q.includes("first") ||
    q.includes("priorit") ||
    q.includes("order")
  ) {
    const ordered = prioritizePieceCoachIssues(allIssues);
    if (ordered.length === 0) return "• Keep looping the piece slowly.";
    const lines = ordered.slice(0, 3).map((item, index) => {
      const place = pieceCoachPlaceLine(item);
      const label = place ? `${item.what} — ${place}` : item.what;
      return index === 0 ? `• First: ${label}` : `• Then: ${label}`;
    });
    return lines.join("\n");
  }
  if (
    q.includes("where") ||
    q.includes("look") ||
    q.includes("show") ||
    q.includes("score") ||
    q.includes("bar") ||
    q.includes("measure")
  ) {
    return `• ${issue.where}`;
  }
  if (
    q.includes("practise") ||
    q.includes("practice") ||
    q.includes("fix") ||
    q.includes("how")
  ) {
    return `• ${issue.practise}`;
  }
  if (q.includes("why") || q.includes("what") || q.includes("happen")) {
    return `• ${issue.what}\n• ${issue.coach}`;
  }
  return `• ${issue.coach}`;
}
