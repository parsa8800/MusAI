"use client";

import { useMemo } from "react";
import { CoachParsaChat } from "@/components/CoachParsaChat";
import { PieceCoachLessonCard } from "@/features/piece-studio/feedback/visual/PieceCoachLessonCard";
import {
  localPieceCoachReply,
  pieceCoachSuggestedQuestions,
} from "@/features/piece-studio/feedback/visual/pieceCoachChat";
import {
  pieceCoachCategoryTitle,
  pieceCoachUsefulWhere,
  type PieceCoachIssueView,
} from "@/features/piece-studio/feedback/visual/pieceCoachIssueView";
import { tapFeedback } from "@/lib/motion";

function skillRailLabel(issue: PieceCoachIssueView): string {
  // Prefer a short student name; never surface analyzer / not_ready jargon.
  const fromCategory = pieceCoachCategoryTitle(issue.category);
  if (issue.category === "tempo") {
    const kind = issue.label?.trim();
    if (kind && kind.length <= 16) return kind;
  }
  return fromCategory;
}

/**
 * Piece Practise coach: skills rail + lesson card outside chat.
 * Chat is only for questions about the current focus.
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

  const suggestions = useMemo(
    () => (active ? pieceCoachSuggestedQuestions(active) : []),
    [active],
  );

  if (!active) return null;

  const fromTake = active.source === "analysis";
  const where = pieceCoachUsefulWhere(active);

  return (
    <div
      className="musai-piece-review"
      data-testid="piece-feedback-preview"
      data-mock={fromTake ? "false" : "true"}
      data-source={active.source}
      aria-label="Piece practise feedback"
    >
      <div
        className="musai-piece-review__skills"
        role="listbox"
        aria-label="What to work on"
        data-testid="piece-focus-skills"
      >
        <p className="musai-piece-review__skills-label">What to work on</p>
        <div className="musai-piece-review__skills-list">
          {issues.map((issue) => {
            const selected = issue.id === active.id;
            return (
              <button
                key={issue.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={
                  selected
                    ? "musai-pressable musai-piece-review__skill is-active"
                    : "musai-pressable musai-piece-review__skill"
                }
                data-tone={issue.visualTone ?? undefined}
                onClick={() => {
                  if (selected) return;
                  tapFeedback("light");
                  onActiveId(issue.id);
                }}
              >
                {skillRailLabel(issue)}
              </button>
            );
          })}
        </div>
      </div>

      <PieceCoachLessonCard
        where={where}
        what={active.what}
        tryThis={active.practise}
        sample={!fromTake}
        onShowOnScore={
          onShowOnScore
            ? () => {
                onActiveId(active.id);
                onShowOnScore(active.id);
              }
            : undefined
        }
      />

      <div className="musai-piece-review__chat">
        <CoachParsaChat
          key={active.id}
          start
          embed
          title="Ask Parsa"
          openerText=""
          source="template"
          suggestions={suggestions}
          showPreviewDot={false}
          getReply={async (userText) => ({
            reply: localPieceCoachReply(userText, active),
            source: "template",
          })}
        />
      </div>
    </div>
  );
}
