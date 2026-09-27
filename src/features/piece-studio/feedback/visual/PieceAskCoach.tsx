"use client";

import { useMemo } from "react";
import { CoachParsaChat } from "@/components/CoachParsaChat";
import {
  localPieceAskReply,
  pieceAskSuggestions,
  pieceCoachSuggestedQuestions,
  type PieceAskContext,
} from "@/features/piece-studio/feedback/visual/pieceCoachChat";
import type { PieceCoachIssueView } from "@/features/piece-studio/feedback/visual/pieceCoachIssueView";

/**
 * Piece coach chat. Works from the written score alone, so Score and
 * Practise can both ask questions before any recording.
 */
export function PieceAskCoach({
  pieceId,
  context,
  issue = null,
  issues = [],
}: {
  pieceId: string;
  context: PieceAskContext;
  issue?: PieceCoachIssueView | null;
  issues?: readonly PieceCoachIssueView[];
}) {
  const suggestions = useMemo(() => {
    const follow = issue ? pieceCoachSuggestedQuestions(issue) : [];
    const aboutPiece = pieceAskSuggestions(context);
    return [...follow, ...aboutPiece].filter(
      (prompt, index, all) => all.indexOf(prompt) === index,
    );
  }, [context, issue]);

  return (
    <CoachParsaChat
      start
      embed
      title="Coach · Parsa"
      openerText=""
      source="template"
      suggestions={suggestions}
      showPreviewDot={false}
      threadKey={`piece:${pieceId}`}
      getReply={async (userText) => ({
        reply: localPieceAskReply(userText, context, issue, issues),
        source: "template",
      })}
    />
  );
}
