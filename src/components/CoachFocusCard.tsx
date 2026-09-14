"use client";

import { tapFeedback } from "@/lib/motion";

export type CoachFocusLaterItem = {
  id: string;
  label: string;
  tone?: string | null;
};

/**
 * Shared Coach · Parsa focus card — Focus / Improve / Try.
 * Optional location + Show on score; deeper detail lives in chat.
 */
export function CoachFocusCard({
  focus,
  whatToImprove,
  tryThis,
  where = null,
  onShowOnScore,
  later = [],
  onSelectLater,
}: {
  focus: string;
  whatToImprove: string;
  tryThis: string;
  where?: string | null;
  onShowOnScore?: () => void;
  later?: readonly CoachFocusLaterItem[];
  onSelectLater?: (id: string) => void;
}) {
  return (
    <div className="musai-coach-focus" data-testid="coach-focus-card">
      <div className="musai-coach-focus__block">
        <p className="musai-coach-focus__label">Focus</p>
        <p className="musai-coach-focus__focus">{focus}</p>
      </div>

      <div className="musai-coach-focus__block">
        <p className="musai-coach-focus__label">Improve</p>
        <p className="musai-coach-focus__body">{whatToImprove}</p>
      </div>

      <div className="musai-coach-focus__block">
        <p className="musai-coach-focus__label">Try</p>
        <p className="musai-coach-focus__body">{tryThis}</p>
      </div>

      {where || onShowOnScore ? (
        <div className="musai-coach-focus__where-row">
          {where ? (
            <p className="musai-coach-focus__where" data-testid="coach-focus-where">
              {where}
            </p>
          ) : null}
          {onShowOnScore ? (
            <button
              type="button"
              className="musai-pressable musai-coach-focus__show"
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
      ) : null}

      {later.length > 0 ? (
        <div className="musai-coach-focus__later">
          <p className="musai-coach-focus__label">Also</p>
          <div className="musai-coach-focus__chips">
            {later.map((item) => (
              <button
                key={item.id}
                type="button"
                className="musai-pressable musai-coach-focus__chip"
                data-tone={item.tone ?? undefined}
                onClick={() => {
                  tapFeedback("light");
                  onSelectLater?.(item.id);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
