"use client";

import { useEffect, useId, useRef, useState } from "react";

export function ReferenceToneHelpButton() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const titleId = useId().replace(/:/g, "");

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? titleId : undefined}
        aria-label="Reference tone help"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/[0.1] text-[13px] font-semibold italic leading-none text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-md transition hover:border-emerald-400/45 hover:bg-white/[0.14] hover:text-white active:scale-95"
      >
        i
      </button>
      {open ? (
        <div
          className="absolute bottom-11 right-0 z-50 w-[min(calc(100vw-2rem),288px)] origin-bottom-right rounded-2xl border border-white/[0.12] bg-zinc-950/96 p-4 shadow-[0_24px_64px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <p
            id={titleId}
            className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400/90"
          >
            Reference tone
          </p>
          <ul className="mt-3.5 list-none space-y-3 text-left text-[12px] leading-relaxed text-zinc-400">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-[10px] font-bold text-emerald-400/95 ring-1 ring-emerald-500/25">
                1
              </span>
              <span>
                Press and hold a note on the ring to hear a sustained reference
                pitch. Drag around the wheel to change notes while you hold.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-fuchsia-500/15 text-[10px] font-bold text-fuchsia-300/95 ring-1 ring-fuchsia-500/25">
                2
              </span>
              <span>
                Double click a note on desktop, or double tap on touch, to
                latch it. Latched notes keep playing. You can latch several at
                once and still hold other notes.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-[10px] font-bold text-zinc-500 ring-1 ring-white/10">
                3
              </span>
              <span>
                Use the octave controls in the center hub when you need a
                different register.
              </span>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
