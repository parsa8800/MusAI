"use client";

import { useMemo } from "react";
import { CoachParsaShell } from "@/components/CoachParsaShell";
import {
  localPieceCoachReply,
  pieceCoachOpenerText,
  pieceCoachSuggestedQuestions,
} from "@/features/piece-studio/feedback/visual/pieceCoachChat";
import {
  pieceCoachCategoryTitle,
  pieceCoachUsefulWhere,
  type PieceCoachIssueView,
} from "@/features/piece-studio/feedback/visual/pieceCoachIssueView";

/**
 * Piece Studio adapter for the shared Coach · Parsa shell.
 */
export function PieceFeedbackReview({
  issues,
  activeId,
  onActiveId,
  onShowOnScore,
}: {
  issues: readonly PieceCoachIssueView[];
  activeId: string | null;
  onActiveId: (id: string) => void;
  /** Highlight the focused note/measure on the score. */
  onShowOnScore?: (id: string) => void;
}) {
  const active =
    issues.find((issue) => issue.id === activeId) ?? issues[0] ?? null;

  const openerText = useMemo(
    () => (active ? pieceCoachOpenerText(active) : ""),
    [active],
  );
  const suggestions = useMemo(
    () => (active ? pieceCoachSuggestedQuestions(active) : []),
    [active],
  );

  if (!active) return null;

  const fromTake = active.source === "analysis";
  const others = issues.filter((issue) => issue.id !== active.id);
  const where = pieceCoachUsefulWhere(active);

  return (
    <CoachParsaShell
      key={active.id}
      start
      embed
      title="Coach · Parsa"
      className="musai-piece-review"
      data-testid="piece-feedback-preview"
      dataMock={fromTake ? "false" : "true"}
      dataSource={active.source}
      showPreviewDot={!fromTake}
      openerText={openerText}
      source="template"
      suggestions={suggestions}
      focus={{
        focus: pieceCoachCategoryTitle(active.category),
        whatToImprove: active.what,
        tryThis: active.practise,
        where,
        onShowOnScore: onShowOnScore
          ? () => {
              onActiveId(active.id);
              onShowOnScore(active.id);
            }
          : undefined,
        later: others.map((issue) => ({
          id: issue.id,
          label: issue.label,
          tone: issue.visualTone,
        })),
        onSelectLater: onActiveId,
      }}
      getReply={async (userText) => ({
        reply: localPieceCoachReply(userText, active),
        source: "template",
      })}
    />
  );
}
