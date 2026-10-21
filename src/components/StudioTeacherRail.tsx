import type { ReactNode } from "react";

/**
 * Shared teacher card for Piece and Scale.
 * The note sits on top and the ask field sits under it. The card grows with
 * the conversation, and only the replies scroll once it reaches the score.
 */
export function StudioTeacherRail({
  id,
  label,
  feedback,
  ask,
  onClose,
}: {
  id: string;
  label: string;
  feedback: ReactNode;
  ask: ReactNode;
  onClose: () => void;
}) {
  return (
    <aside
      id={id}
      className="musai-studio-coach-drawer musai-teacher-rail musai-teacher-panel"
      aria-label={label}
    >
      <div className="musai-teacher-rail__bar">
        <p className="musai-teacher-rail__name">{label}</p>
        <button
          type="button"
          className="musai-pressable musai-teacher-rail__close"
          aria-label={`Hide ${label.toLowerCase()}`}
          onClick={onClose}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <div className="musai-teacher-rail__feedback">{feedback}</div>
      <div className="musai-teacher-rail__ask">{ask}</div>
    </aside>
  );
}
