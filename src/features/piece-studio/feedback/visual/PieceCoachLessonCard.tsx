"use client";

import { tapFeedback } from "@/lib/motion";

function oneLine(text: string): string {
  return text.trim().replace(/[.!?]+$/u, "");
}

/**
 * One selectable issue — quiet one-liner when idle; place + tip when open.
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
  const tip = oneLine(what);
  const tryNext = oneLine(next);

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
      {selected ? (
        <>
          {place ? (
            <p
              className="musai-piece-lesson__place"
              data-testid="piece-focus-where"
            >
              {place}
            </p>
          ) : null}
          <p className="musai-piece-lesson__what" data-testid="piece-focus-what">
            {`• ${tip}`}
          </p>
          {tryNext ? (
            <p className="musai-piece-lesson__try" data-testid="piece-focus-try">
              {`• ${tryNext}`}
            </p>
          ) : null}
        </>
      ) : (
        <p className="musai-piece-lesson__line" data-testid="piece-focus-what">
          {place ? (
            <>
              <span
                className="musai-piece-lesson__place-inline"
                data-testid="piece-focus-where"
              >
                {place}
              </span>
              {" · "}
            </>
          ) : null}
          {tip}
        </p>
      )}
    </button>
  );
}
