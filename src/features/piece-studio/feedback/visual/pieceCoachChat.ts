import type { PieceCoachIssueView } from "@/features/piece-studio/feedback/visual/pieceCoachIssueView";

/** Chat stays quiet — the focus card already carries the main feedback. */
export function pieceCoachOpenerText(_issue: PieceCoachIssueView): string {
  void _issue;
  return "";
}

export function pieceCoachSuggestedQuestions(
  issue: PieceCoachIssueView,
): string[] {
  return [
    "Where on the score?",
    "How do I practise?",
    issue.what ? "Why?" : "What next?",
  ].slice(0, 3);
}

/**
 * Local Piece coach replies grounded in the focused issue.
 * Does not call Scale Studio APIs.
 */
export function localPieceCoachReply(
  question: string,
  issue: PieceCoachIssueView,
): string {
  const q = question.toLowerCase();
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
    return `• ${issue.what}`;
  }
  return `• ${issue.coach}`;
}
