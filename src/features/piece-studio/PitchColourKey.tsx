"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ScalePitchCueKey } from "@/components/ScalePitchCueKey";
import { tapFeedback } from "@/lib/motion";

/**
 * Quiet pitch-colour key. Always available, open only when asked.
 */
export function PitchColourKey() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="musai-pitch-key-pop" ref={rootRef}>
      <button
        type="button"
        className="musai-pressable musai-pitch-key-pop__btn"
        aria-label="Note colours"
        aria-expanded={open}
        aria-controls={panelId}
        data-active={open ? "true" : "false"}
        onClick={() => {
          tapFeedback("light");
          setOpen((value) => !value);
        }}
      >
        <span className="musai-pitch-key-pop__dots" aria-hidden>
          <i data-tone="ok" />
          <i data-tone="high" />
          <i data-tone="low" />
          <i data-tone="miss" />
        </span>
      </button>
      {open ? (
        <div
          id={panelId}
          className="musai-pitch-key-pop__panel"
          role="dialog"
          aria-label="Note colours"
        >
          <ScalePitchCueKey compact />
        </div>
      ) : null}
    </div>
  );
}
