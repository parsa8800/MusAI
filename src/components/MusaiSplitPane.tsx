"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";

const DEFAULT_RATIO = 0.5;
const MIN_RATIO = 0.28;
const MAX_RATIO = 0.72;

function clampRatio(n: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, n));
}

function readStoredRatio(storageKey: string | undefined): number {
  if (!storageKey || typeof window === "undefined") return DEFAULT_RATIO;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return DEFAULT_RATIO;
    const n = Number(raw);
    return Number.isFinite(n) ? clampRatio(n) : DEFAULT_RATIO;
  } catch {
    return DEFAULT_RATIO;
  }
}

/**
 * Two columns with a draggable vertical divider (desktop).
 * Stacks on small screens — no drag handle.
 */
export function MusaiSplitPane({
  left,
  right,
  storageKey,
  className = "",
}: {
  left: ReactNode;
  right: ReactNode;
  /** Persist split ratio in localStorage across visits. */
  storageKey?: string;
  className?: string;
}) {
  const paneId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [dragging, setDragging] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const draggingRef = useRef(false);

  useEffect(() => {
    setRatio(readStoredRatio(storageKey));
  }, [storageKey]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const persist = useCallback(
    (next: number) => {
      if (!storageKey) return;
      try {
        window.localStorage.setItem(storageKey, String(next));
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  const setRatioFromClientX = useCallback(
    (clientX: number) => {
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      if (rect.width < 1) return;
      const next = clampRatio((clientX - rect.left) / rect.width);
      setRatio(next);
      persist(next);
    },
    [persist],
  );

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      e.preventDefault();
      setRatioFromClientX(e.clientX);
    };
    const onUp = () => {
      draggingRef.current = false;
      setDragging(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, setRatioFromClientX]);

  useEffect(() => {
    if (!dragging) return;
    const prev = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = prev;
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging]);

  const onHandleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.08 : 0.03;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setRatio((r) => {
        const next = clampRatio(r - step);
        persist(next);
        return next;
      });
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setRatio((r) => {
        const next = clampRatio(r + step);
        persist(next);
        return next;
      });
    } else if (e.key === "Home") {
      e.preventDefault();
      setRatio(DEFAULT_RATIO);
      persist(DEFAULT_RATIO);
    }
  };

  const leftStyle: CSSProperties | undefined = desktop
    ? { flexGrow: ratio, flexShrink: 1, flexBasis: 0 }
    : undefined;
  const rightStyle: CSSProperties | undefined = desktop
    ? { flexGrow: 1 - ratio, flexShrink: 1, flexBasis: 0 }
    : undefined;

  return (
    <div
      ref={rootRef}
      className={`relative flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row ${className}`.trim()}
    >
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:min-w-[12rem]"
        style={leftStyle}
      >
        {left}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-controls={paneId}
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={Math.round(MIN_RATIO * 100)}
        aria-valuemax={Math.round(MAX_RATIO * 100)}
        aria-label="Resize notes and feedback"
        tabIndex={0}
        onKeyDown={onHandleKeyDown}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          draggingRef.current = true;
          setDragging(true);
          setRatioFromClientX(e.clientX);
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        className={`relative z-10 hidden shrink-0 touch-none md:flex md:w-3 md:cursor-col-resize md:items-stretch md:justify-center ${
          dragging
            ? "bg-[color-mix(in_srgb,var(--musai-accent)_12%,transparent)]"
            : ""
        }`}
      >
        <span
          className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 ${
            dragging ? "bg-[var(--musai-accent)]" : "bg-[var(--musai-border)]"
          }`}
          aria-hidden
        />
        <span
          className={`pointer-events-none relative z-[1] my-auto h-10 w-1 rounded-full ${
            dragging ? "bg-[var(--musai-accent)]" : "bg-[var(--musai-border)]"
          }`}
          aria-hidden
        />
      </div>

      <div
        id={paneId}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-t border-[var(--musai-border)] md:min-w-[12rem] md:border-t-0"
        style={rightStyle}
      >
        {right}
      </div>
    </div>
  );
}
