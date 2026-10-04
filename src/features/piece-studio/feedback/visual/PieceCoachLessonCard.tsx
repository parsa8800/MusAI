"use client";

import { tapFeedback } from "@/lib/motion";

function oneLine(text: string): string {
  return text.trim().replace(/[.!?]+$/u, "");
}

/**
 * One selectable issue — where, what’s wrong, and (when selected) what to try.
 */
export function PieceCoachLessonCard({
  place,
  what,
  next,
  selected,
  onSelect,
}: {
  place: string | null;
  what: string;
  next: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={[
        "musai-pressable",
        "musai-piece-lesson",
        selected ? "is-selected" : "is-idle",
      ].join(" ")}
      data-testid="piece-focus-card"
      onClick={() => {
        tapFeedback(selected ? "light" : "medium");
        onSelect();
      }}
    >
      {place ? (
        <p className="musai-piece-lesson__place" data-testid="piece-focus-where">
          {place}
        </p>
      ) : null}

      {selected && next.trim() ? (
        <>
          <p className="musai-piece-lesson__what" data-testid="piece-focus-what">
            {`• ${oneLine(what)}`}
          </p>
          <p className="musai-piece-lesson__try" data-testid="piece-focus-try">
            {`• ${oneLine(next)}`}
          </p>
        </>
      ) : (
        <p className="musai-piece-lesson__what" data-testid="piece-focus-what">
          {oneLine(what)}
        </p>
      )}
    </button>
  );
}
