"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PieceLibraryCardModel } from "@/features/piece-studio/practice/piecePracticeCopy";
import { tapFeedback } from "@/lib/motion";

/**
 * Library card — title, composer, one quiet progress/status cue.
 * Whole card opens the piece. Remove lives in ··· → confirmation.
 */
export function PieceLibraryCard({
  href,
  model,
  onOpen,
  onRemove,
}: {
  href: string;
  model: PieceLibraryCardModel;
  onOpen: () => void;
  onRemove: () => Promise<void> | void;
}) {
  const menuId = useId();
  const titleId = `${menuId}-confirm-title`;
  const descId = `${menuId}-confirm-desc`;
  const rootRef = useRef<HTMLLIElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const removingRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!confirmOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => cancelRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || removingRef.current) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setConfirmOpen(false);
      setRemoveError(null);
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey, true);
    };
  }, [confirmOpen]);

  const closeMenus = () => {
    setMenuOpen(false);
    setConfirmOpen(false);
    setRemoveError(null);
  };

  const openConfirm = () => {
    setMenuOpen(false);
    setRemoveError(null);
    setConfirmOpen(true);
  };

  const cancelConfirm = () => {
    if (removingRef.current) return;
    setConfirmOpen(false);
    setRemoveError(null);
  };

  const confirmRemove = async () => {
    if (removingRef.current) return;
    removingRef.current = true;
    setRemoving(true);
    setRemoveError(null);
    tapFeedback("medium");
    try {
      await onRemove();
      setConfirmOpen(false);
      setMenuOpen(false);
    } catch (err) {
      setRemoveError(
        err instanceof Error
          ? err.message
          : "Couldn’t remove this piece. Try again.",
      );
    } finally {
      removingRef.current = false;
      setRemoving(false);
    }
  };

  const openLabel =
    model.state === "check" ? `Review ${model.title}` : `Open ${model.title}`;

  const confirmDialog =
    confirmOpen && portalReady
      ? createPortal(
          <div
            className="musai-piece-remove"
            role="presentation"
            data-testid="piece-remove-dialog"
            onMouseDown={(e) => {
              if (e.target !== e.currentTarget || removing) return;
              cancelConfirm();
            }}
          >
            <div
              className="musai-piece-remove__panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={descId}
            >
              <p id={titleId} className="musai-piece-remove__title">
                Remove “{model.title}”?
              </p>
              <p id={descId} className="musai-piece-remove__lead">
                This will remove the piece and its saved practice progress.
              </p>
              {removeError ? (
                <p className="musai-piece-remove__error" role="alert">
                  {removeError}
                </p>
              ) : null}
              <div className="musai-piece-remove__actions">
                <button
                  ref={cancelRef}
                  type="button"
                  className="musai-pressable musai-piece-remove__cancel"
                  disabled={removing}
                  onClick={cancelConfirm}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="musai-pressable musai-piece-remove__confirm"
                  data-testid="piece-remove-confirm"
                  disabled={removing}
                  aria-busy={removing}
                  onClick={() => void confirmRemove()}
                >
                  {removing ? "Removing…" : "Remove"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <li
      ref={rootRef}
      className="musai-piece-library__item"
      data-state={model.state}
    >
      <a
        href={href}
        className="musai-piece-library__card"
        data-testid="piece-library-card"
        aria-label={openLabel}
        onClick={(event) => {
          event.preventDefault();
          closeMenus();
          onOpen();
        }}
      >
        <span className="musai-piece-library__main">
          <span className="musai-piece-library__title">{model.title}</span>
          {model.composer ? (
            <span className="musai-piece-library__composer">{model.composer}</span>
          ) : null}
        </span>

        {model.state === "practised" ? (
          <span className="musai-piece-library__cue">
            <span
              className="musai-piece-library__rail"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={model.progressFill}
              aria-label={`Best ${model.bestPercent ?? model.progressFill}%`}
            >
              <span
                className="musai-piece-library__rail-fill"
                style={{ width: `${model.progressFill}%` }}
              />
            </span>
            {model.bestPercent != null ? (
              <span className="musai-piece-library__score">
                Best {model.bestPercent}%
              </span>
            ) : null}
          </span>
        ) : null}

        {model.statusLabel ? (
          <span className="musai-piece-library__status">{model.statusLabel}</span>
        ) : null}
      </a>

      <div className="musai-piece-library__actions">
        <button
          type="button"
          className="musai-pressable musai-piece-library__more"
          aria-label={`More actions for ${model.title}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            tapFeedback("light");
            setConfirmOpen(false);
            setRemoveError(null);
            setMenuOpen((open) => !open);
          }}
        >
          <svg
            viewBox="0 0 24 24"
            className="musai-piece-library__more-icon"
            fill="currentColor"
            aria-hidden
          >
            <circle cx="5" cy="12" r="1.55" />
            <circle cx="12" cy="12" r="1.55" />
            <circle cx="19" cy="12" r="1.55" />
          </svg>
        </button>

        {menuOpen ? (
          <div
            id={menuId}
            className="musai-piece-library__menu"
            role="menu"
            aria-label={`${model.title} actions`}
          >
            <button
              type="button"
              role="menuitem"
              className="musai-piece-library__menu-item"
              data-testid="piece-remove-menu-item"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                tapFeedback("light");
                openConfirm();
              }}
            >
              Remove piece
            </button>
          </div>
        ) : null}
      </div>

      {confirmDialog}
    </li>
  );
}
