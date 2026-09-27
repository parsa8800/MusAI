"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isMachinePieceTitle } from "@/features/piece-studio/pieceTitle";

function fitNameField(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/**
 * Click the title, type, then click away or press Enter.
 * A file id opens the field immediately.
 */
export function PieceNameControl({
  title,
  suggestion = null,
  onName,
  onCommit,
  variant = "page",
}: {
  title: string;
  suggestion?: string | null;
  /** Latest text, including while the field is open. */
  onName?: (name: string) => void;
  /** Save from Enter or leaving the field. */
  onCommit?: (name: string) => void;
  /** Page heading, or the one-line title on a library card. */
  variant?: "page" | "card";
}) {
  const machine = isMachinePieceTitle(title);
  const recommended =
    suggestion &&
    !isMachinePieceTitle(suggestion) &&
    suggestion.trim().toLowerCase() !== title.trim().toLowerCase()
      ? suggestion.trim()
      : null;
  const [editing, setEditing] = useState(machine);
  const [draft, setDraft] = useState(machine ? (recommended ?? "") : title);
  const editingRef = useRef(editing);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  editingRef.current = editing;

  useEffect(() => {
    if (editingRef.current) {
      if (machine && recommended) {
        setDraft((current) => (current.trim() ? current : recommended));
      }
      return;
    }
    setEditing(machine);
    setDraft(machine ? (recommended ?? "") : title);
  }, [title, machine, recommended]);

  const wasEditing = useRef(false);
  useLayoutEffect(() => {
    if (!editing) {
      wasEditing.current = false;
      return;
    }
    fitNameField(fieldRef.current);
    if (!wasEditing.current) fieldRef.current?.focus();
    wasEditing.current = true;
  }, [draft, editing]);

  const heading =
    draft.trim() && !isMachinePieceTitle(draft) ? draft.trim() : title;
  useEffect(() => {
    onName?.(editing ? draft : heading);
  }, [onName, editing, draft, heading]);

  const commit = (next: string) => {
    const trimmed = next.trim();
    if (!trimmed || isMachinePieceTitle(trimmed)) {
      setDraft(machine ? (recommended ?? "") : title);
      setEditing(machine);
      return;
    }
    if (trimmed !== title.trim()) onCommit?.(trimmed);
    onName?.(trimmed);
    setEditing(false);
    setDraft(trimmed);
  };

  const start = () => {
    setDraft(heading && !isMachinePieceTitle(heading) ? heading : "");
    setEditing(true);
  };

  const rootClass =
    variant === "card"
      ? "musai-piece-name musai-piece-name--card"
      : "musai-piece-name";

  if (!editing) {
    const label = (
      <button
        type="button"
        className="musai-pressable musai-piece-name__title font-display"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          start();
        }}
      >
        {heading}
      </button>
    );
    return (
      <div className={rootClass} data-piece-name="true">
        {variant === "page" ? <h1 className="musai-piece-name__heading">{label}</h1> : label}
      </div>
    );
  }

  return (
    <form
      className={rootClass}
      data-piece-name="true"
      onSubmit={(event) => {
        event.preventDefault();
        commit(draft);
      }}
    >
      <label
        className="musai-piece-name__field font-display"
        data-value={draft.trim() ? draft : "Name this piece"}
      >
        <span className="sr-only">Piece name</span>
        <textarea
          ref={fieldRef}
          className="musai-piece-name__input font-display"
          value={draft}
          placeholder="Name this piece"
          rows={1}
          data-testid="piece-name-input"
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setDraft(machine ? (recommended ?? "") : title);
              setEditing(machine);
              return;
            }
            if (event.key !== "Enter" || event.shiftKey) return;
            event.preventDefault();
            commit(draft);
          }}
        />
      </label>
    </form>
  );
}
