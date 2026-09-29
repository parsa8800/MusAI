"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PieceLibraryIncipit } from "@/features/piece-studio/PieceLibraryIncipit";
import { PieceNameControl } from "@/features/piece-studio/PieceNameControl";
import type { PieceLibraryCardModel } from "@/features/piece-studio/practice/piecePracticeCopy";
import { isMachinePieceTitle } from "@/features/piece-studio/pieceTitle";
import { tapFeedback } from "@/lib/motion";

/**
 * Library card — the same frame for every piece.
 * Whole card opens the piece. Remove lives in the ··· menu.
 */
export function PieceLibraryCard({
  href,
  model,
  musicXml = null,
  onOpen,
  onRemove,
  onRename,
}: {
  href: string;
  model: PieceLibraryCardModel;
  musicXml?: string | null;
  onOpen: () => void;
  onRemove: () => Promise<void> | void;
  onRename?: (title: string) => void;
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
          : "Couldn’t remove this piece",
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
              <p id={titleId} className="musai-piece-remove__title font-display">
                {isMachinePieceTitle(model.title) ? "Remove this piece" : model.title}
              </p>
              <p id={descId} className="musai-piece-remove__lead">
                Saved practice goes with it
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
                  className="musai-pressable musai-piece-remove__keep"
                  disabled={removing}
                  onClick={cancelConfirm}
                >
                  Keep
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
      <div className="musai-piece-library__card" data-testid="piece-library-card">
        <a
          href={href}
          className="musai-piece-library__hit"
          aria-label={openLabel}
          onClick={(event) => {
            event.preventDefault();
            closeMenus();
            onOpen();
          }}
        />
        <span className="musai-piece-library__main">
          <PieceLibraryIncipit musicXml={musicXml} />
          <PieceNameControl
            variant="card"
            title={model.title}
            onCommit={(next) => onRename?.(next)}
          />
          <span className="musai-piece-library__composer">
            {model.composer ?? ""}
          </span>
          {model.statusLabel ? (
            <span className="musai-piece-library__status">{model.statusLabel}</span>
          ) : null}
        </span>
      </div>

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
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M3.2 4.2h9.6M6.1 4.1V3.2h3.8v.9M4.4 4.2l.5 8.1h6.2l.5-8.1"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.35"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Remove piece
            </button>
          </div>
        ) : null}
      </div>

      {confirmDialog}
    </li>
  );
}
