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
  if (issue.severity === "notice") return 1;
  return 2;
}

/** Order issues the way a teacher would — pitch before tempo, focus before notice. */
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

/** One turn already in the teacher thread. */
export type PieceCoachChatTurn = {
  role: "user" | "assistant";
  text: string;
};

/** Two short ideas before the student has asked anything. */
export function pieceCoachIdlePrompts(): string[] {
  return ["What key is this?", "Where should I start?"];
}

/** One follow-up after they have started talking. */
export function pieceCoachFollowPrompt(
  issue: PieceCoachIssueView | null,
): string {
  return issue ? "How do I practise this?" : "How should I practise the opening?";
}

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

const NAMED_BAR = /\b(?:bars?|measures?)\s+(\d+)\b/i;

/** The bar the student just named, if the question points at one. */
function namedBar(text: string): string | null {
  const match = text.match(NAMED_BAR);
  if (!match?.[1]) return null;
  const bar = Number(match[1]);
  return Number.isFinite(bar) ? String(bar) : null;
}

/**
 * The last bar the student asked about, ignoring the question we are answering now.
 */
function earlierBar(
  question: string,
  history: readonly PieceCoachChatTurn[],
): string | null {
  const turns = [...history];
  const last = turns[turns.length - 1];
  if (last?.role === "user" && last.text.trim() === question.trim()) {
    turns.pop();
  }
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (turn?.role !== "user") continue;
    const bar = namedBar(turn.text);
    if (bar) return bar;
  }
  return null;
}

function spotBar(issue: PieceCoachIssueView | null): string | null {
  if (!issue || issue.category === "tempo") return null;
  if (!issue.measure || issue.measure === "?") return null;
  const bar = Number(issue.measure);
  return Number.isFinite(bar) ? String(bar) : null;
}

function issueCoversBar(issue: PieceCoachIssueView, bar: string): boolean {
  if (issue.category === "tempo") return false;
  const target = Number(bar);
  if (!Number.isFinite(target)) return false;
  if (issue.measure && Number(issue.measure) === target) return true;
  const where = `${issue.where} ${issue.label}`;
  const range = where.match(/\bbars?\s+(\d+)\s+to\s+(\d+)\b/i);
  if (range) {
    const lo = Math.min(Number(range[1]), Number(range[2]));
    const hi = Math.max(Number(range[1]), Number(range[2]));
    if (target >= lo && target <= hi) return true;
  }
  return [...where.matchAll(/\bbars?\s+(\d+)\b/gi)].some(
    (match) => Number(match[1]) === target,
  );
}

function tipLine(text: string): string {
  return text
    .replace(/[—–]/g, " ")
    .replace(/\s+-\s+/g, " ")
    .replace(/[.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function joinSpoken(parts: readonly string[]): string {
  const unique: string[] = [];
  for (const part of parts) {
    const line = part.trim();
    if (!line || unique.some((item) => item.toLowerCase() === line.toLowerCase())) {
      continue;
    }
    unique.push(line);
  }
  if (unique.length === 0) return "";
  if (unique.length === 1) return unique[0]!;
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique.slice(0, -1).join(", ")}, and ${unique[unique.length - 1]}`;
}

function happenedClause(issue: PieceCoachIssueView): string {
  if (issue.category === "pitch") {
    if (issue.kind === "sharp") return "the pitch sat sharp";
    if (issue.kind === "flat") return "the pitch sat flat";
    if (issue.kind === "missed") return "a note was missed";
    if (issue.kind === "unstable") return "the pitch wobbled";
  }
  if (issue.category === "rhythm") {
    if (issue.kind === "early") return "the rhythm came in early";
    if (issue.kind === "late") return "the rhythm came in late";
    if (issue.kind === "duration") {
      return /long/i.test(issue.what)
        ? "a note was held too long"
        : "a note was cut short";
    }
    return "the rhythm was uneven";
  }
  if (issue.category === "dynamics") {
    const heard = tipLine(issue.what);
    return heard ? heard.charAt(0).toLowerCase() + heard.slice(1) : "the dynamic was off";
  }
  const heard = tipLine(issue.what);
  return heard ? heard.charAt(0).toLowerCase() + heard.slice(1) : "that spot needs another look";
}

/** Pitch, rhythm, and dynamics for one bar on this take. */
function answerForBar(
  bar: string,
  issues: readonly PieceCoachIssueView[],
  hasTake: boolean,
): string {
  const here = prioritizePieceCoachIssues(
    issues.filter((issue) => issueCoversBar(issue, bar)),
  );
  if (here.length === 0) {
    return hasTake
      ? `• Bar ${bar} was fine\n• Keep it the way you played it`
      : `• Record a take when you want notes on bar ${bar}\n• You can still ask about the key, the tempo, or where to start`;
  }
  const clauses: string[] = [];
  for (const issue of here) {
    const clause = happenedClause(issue);
    if (clauses.some((item) => item.toLowerCase() === clause.toLowerCase())) continue;
    clauses.push(clause);
    if (clauses.length === 3) break;
  }
  const tries: string[] = [];
  for (const issue of here) {
    const line = tipLine(issue.practise);
    if (!line || tries.some((item) => item.toLowerCase() === line.toLowerCase())) {
      continue;
    }
    tries.push(line.charAt(0).toLowerCase() + line.slice(1));
    if (tries.length === 2) break;
  }
  const what = `In bar ${bar} ${joinSpoken(clauses)}`;
  const how = tries.length > 0 ? joinSpoken(tries) : "loop that bar slowly";
  const howLine = how.charAt(0).toUpperCase() + how.slice(1);
  return `• ${what}\n• ${howLine}`;
}

/**
 * Answers about the written piece, or about a bar on this take.
 * A named bar wins. A follow-up with no bar stays on the last bar in the chat.
 */
export function localPieceAskReply(
  question: string,
  ctx: PieceAskContext,
  issue: PieceCoachIssueView | null = null,
  allIssues: readonly PieceCoachIssueView[] = [],
  history: readonly PieceCoachChatTurn[] = [],
  hasTake = allIssues.length > 0 || issue != null,
): string {
  const q = question.toLowerCase().trim();
  const pool = allIssues.length > 0 ? allIssues : issue ? [issue] : [];

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

  const asked = namedBar(question);
  if (asked) return answerForBar(asked, pool, hasTake);

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
      ? `• ${ctx.composer} wrote ${ctx.title}.`
      : `• This is ${ctx.title}.`;
  }

  if (
    /\b(where (should|do) i start|where to start|how (do|should) i (practise|practice) the opening|how (do|should) i (begin|start))\b/.test(
      q,
    )
  ) {
    const place = ctx.measureCount > 8 ? "the opening phrase" : "the opening";
    return `• Start with ${place} and play it slowly.\n• Loop a short bit until it feels easy. You can record whenever you want notes on your playing.`;
  }

  const spot = earlierBar(question, history) ?? spotBar(issue);
  if (spot && (hasTake || pool.length > 0)) {
    return answerForBar(spot, pool, true);
  }

  if (issue && /\b(why|what|how|practise|practice|where|next|fix|sharp|flat)\b/.test(q)) {
    return localPieceCoachReply(question, issue, pool.length > 0 ? pool : [issue]);
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
  history: readonly PieceCoachChatTurn[] = [],
): string {
  const asked = namedBar(question) ?? earlierBar(question, history);
  if (asked) return answerForBar(asked, allIssues, true);
  const q = question.toLowerCase();
  if (
    q.includes("next") ||
    q.includes("first") ||
    q.includes("priorit") ||
    q.includes("order")
  ) {
    const ordered = prioritizePieceCoachIssues(allIssues);
    if (ordered.length === 0) return "• Keep looping the piece slowly.";
    const lines = ordered.slice(0, 3).map((item) => {
      const place = pieceCoachPlaceLine(item);
      const fact = item.what.replace(/[.]+$/g, "");
      return place ? `• ${place}. ${fact}` : `• ${fact}`;
    });
    return lines.join("\n");
  }
  if (
    q.includes("practise") ||
    q.includes("practice") ||
    q.includes("fix") ||
    q.includes("how")
  ) {
    return `• ${issue.practise}`;
  }
  if (q.includes("why") || q.includes("happen")) {
    return `• ${issue.what}\n• ${issue.practise}`;
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
  return `• ${issue.what}\n• ${issue.practise}`;
}
