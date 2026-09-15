"use client";

import { tapFeedback } from "@/lib/motion";

/**
 * Piece Practise lesson card — one focus, outside the chat transcript.
 * Student language only; no Scale focus-card chrome.
 */
export function PieceCoachLessonCard({
  where,
  what,
  tryThis,
  onShowOnScore,
  sample = false,
}: {
  where: string | null;
  what: string;
  tryThis: string;
  onShowOnScore?: () => void;
  sample?: boolean;
}) {
  return (
    <div className="musai-piece-lesson" data-testid="piece-focus-card">
      {sample ? (
        <p className="musai-piece-lesson__sample" data-testid="piece-focus-sample">
          Sample · not from your take
        </p>
      ) : null}
      {where ? (
        <div className="musai-piece-lesson__row">
          <p className="musai-piece-lesson__label">Where</p>
          <p className="musai-piece-lesson__body" data-testid="piece-focus-where">
            {where}
          </p>
        </div>
      ) : null}
      <div className="musai-piece-lesson__row">
        <p className="musai-piece-lesson__label">What’s wrong</p>
        <p className="musai-piece-lesson__body" data-testid="piece-focus-what">
          {what}
        </p>
      </div>
      <div className="musai-piece-lesson__row">
        <p className="musai-piece-lesson__label">Try this</p>
        <p className="musai-piece-lesson__body" data-testid="piece-focus-try">
          {tryThis}
        </p>
      </div>
      {onShowOnScore ? (
        <button
          type="button"
          className="musai-pressable musai-piece-lesson__show"
          data-testid="coach-focus-show-on-score"
          onClick={() => {
            tapFeedback("medium");
            onShowOnScore();
          }}
        >
          Show on score
        </button>
      ) : null}
    </div>
  );
}
