"use client";

import { CoachParsaChat } from "@/components/CoachParsaChat";
import {
  localPieceAskReply,
  type PieceAskContext,
} from "@/features/piece-studio/feedback/visual/pieceCoachChat";
import type { PieceCoachIssueView } from "@/features/piece-studio/feedback/visual/pieceCoachIssueView";

/**
 * Piece ask field. Feedback for a note lives in the teacher rail above this.
 */
export function PieceAskCoach({
  pieceId,
  context,
  issue = null,
  issues = [],
  hasTake = false,
}: {
  pieceId: string;
  context: PieceAskContext;
  issue?: PieceCoachIssueView | null;
  issues?: readonly PieceCoachIssueView[];
  /** A play-through is on the score, even when this bar has no mark. */
  hasTake?: boolean;
}) {
  return (
    <CoachParsaChat
      start
      embed
      title="Teacher"
      assistantLabel="Teacher"
      placeholder="Ask your teacher..."
      showHeader={false}
      openerText=""
      source="template"
      idleSuggestions={[]}
      followSuggestion={null}
      showPreviewDot={false}
      threadKey={`piece:${pieceId}`}
      getReply={async (userText, history) => ({
        reply: localPieceAskReply(
          userText,
          context,
          issue,
          issues,
          history,
          hasTake,
        ),
        source: "template",
      })}
    />
  );
}
