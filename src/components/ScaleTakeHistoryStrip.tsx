"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { tapFeedback } from "@/lib/motion";
import type { ScaleTakeSummary } from "@/lib/scaleTakeHistory";

const OVERLAY_ROOT_ID = "musai-overlay-root";

function ensureOverlayRoot(): HTMLElement {
  const existing = document.getElementById(OVERLAY_ROOT_ID);
  if (existing) return existing;
  const root = document.createElement("div");
  root.id = OVERLAY_ROOT_ID;
  root.className = "musai-overlay-root";
  document.documentElement.appendChild(root);
  return root;
}

export function ScaleTakeHistoryStrip({
  takes,
  selectedId,
  onSelect,
}: {
  takes: ScaleTakeSummary[];
  selectedId: string;
  onSelect: (sessionId: string) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(null);

  const selected = takes.find((take) => take.sessionId === selectedId);
  const viewingHistorical = Boolean(selected && !selected.isLatest);

  useEffect(() => {
    setOverlayRoot(ensureOverlayRoot());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;

    const place = () => {
      const rect = trigger.getBoundingClientRect();
      const vv = window.visualViewport;
      const vw = vv?.width ?? window.innerWidth;
      const vh = vv?.height ?? window.innerHeight;
      const originX = vv?.offsetLeft ?? 0;
      const originY = vv?.offsetTop ?? 0;
      const margin = 8;
      const width = Math.min(11.5 * 16, vw - margin * 2);
      const left = Math.min(
        Math.max(originX + margin, rect.right - width),
        originX + vw - width - margin,
      );
      const spaceBelow = originY + vh - rect.bottom - margin;
      const openDown = spaceBelow >= 120 || spaceBelow >= rect.top - originY;
      const maxHeight = Math.max(96, openDown ? spaceBelow : rect.top - originY - margin);
      const top = openDown
        ? rect.bottom + 6
        : Math.max(originY + margin, rect.top - 6 - Math.min(maxHeight, menu.scrollHeight || maxHeight));
      menu.style.width = `${Math.round(width)}px`;
      menu.style.left = `${Math.round(left)}px`;
      menu.style.top = `${Math.round(top)}px`;
      menu.style.maxHeight = `${Math.round(maxHeight)}px`;
    };

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, takes.length]);

  if (takes.length < 2) return null;

  const menu = open && overlayRoot ? (
    <div
      ref={menuRef}
      className="musai-take-history__menu musai-scroll"
      role="listbox"
      aria-label="Takes"
    >
      {takes.map((take) => {
        const isSelected = take.sessionId === selectedId;
        return (
          <button
            key={take.sessionId}
            type="button"
            role="option"
            aria-selected={isSelected}
            className="musai-take-history__option musai-pressable"
            onClick={() => {
              tapFeedback("light");
              onSelect(take.sessionId);
              setOpen(false);
            }}
          >
            <span>Take {take.takeNumber}</span>
            {take.isLatest ? (
              <span className="musai-take-history__mark">Latest</span>
            ) : null}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div className="musai-take-history">
      <button
        ref={triggerRef}
        type="button"
        className="musai-take-history__trigger musai-pressable"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={
          viewingHistorical
            ? `Take history, viewing take ${selected?.takeNumber} of ${takes.length}`
            : `Take history, ${takes.length} takes`
        }
        onClick={() => {
          tapFeedback("light");
          setOpen((value) => !value);
        }}
      >
        <span>History</span>
        <span className="musai-take-history__count">{takes.length}</span>
      </button>
      {overlayRoot && menu ? createPortal(menu, overlayRoot) : null}
    </div>
  );
}
