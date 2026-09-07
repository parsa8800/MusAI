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

/** Shared notes | tips split across Scale Studio home, workspace, and results. */
export const MUSAI_SCALE_SPLIT_STORAGE_KEY = "musai-scale-notes-tips-split";

const LEGACY_SPLIT_KEYS = [
  "musai-scale-studio-home-split",
  "musai-scale-workspace-split",
] as const;

function clampRatio(n: number, min = MIN_RATIO, max = MAX_RATIO): number {
  return Math.min(max, Math.max(min, n));
}

function readStoredRatio(
  storageKey: string | undefined,
  min: number,
  max: number,
): number {
  if (!storageKey || typeof window === "undefined") {
    return clampRatio(DEFAULT_RATIO, min, max);
  }
  try {
    const keys =
      storageKey === MUSAI_SCALE_SPLIT_STORAGE_KEY
        ? [storageKey, ...LEGACY_SPLIT_KEYS]
        : [storageKey];
    for (const key of keys) {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const n = Number(raw);
      if (Number.isFinite(n)) return clampRatio(n, min, max);
    }
    return clampRatio(DEFAULT_RATIO, min, max);
  } catch {
    return clampRatio(DEFAULT_RATIO, min, max);
  }
}

function DividerMarks({
  draft,
  dragging,
}: {
  draft: boolean;
  dragging: boolean;
}) {
  const lineClass = dragging
    ? "border-[var(--musai-accent)]"
    : draft
      ? "border-[color-mix(in_srgb,var(--musai-muted)_42%,var(--musai-border))]"
      : "border-[color-mix(in_srgb,var(--musai-border)_85%,transparent)]";

  return (
    <>
      <span
        className={`absolute inset-y-0 left-1/2 w-0 -translate-x-1/2 border-l-2 ${
          draft ? "border-dotted" : "border-solid"
        } ${lineClass}`}
        aria-hidden
      />
      <span
        className={`absolute left-1/2 top-1/2 h-10 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${
          dragging
            ? "bg-[var(--musai-accent)]"
            : "bg-[color-mix(in_srgb,var(--musai-muted)_42%,var(--musai-surface))]"
        }`}
        aria-hidden
      />
    </>
  );
}

/**
 * Two columns with an optional draggable vertical divider (desktop).
 * Stacks on small screens.
 */
export function MusaiSplitPane({
  left,
  right,
  storageKey,
  className = "",
  divider = "soft",
  resizable,
  /** When not resizable, lock the left/right split to this (0–1). */
  fixedRatio,
  minRatio = MIN_RATIO,
  maxRatio = MAX_RATIO,
}: {
  left: ReactNode;
  right: ReactNode;
  /** Persist split ratio in localStorage across visits. */
  storageKey?: string;
  className?: string;
  /** `draft` = dotted template rule. */
  divider?: "soft" | "draft";
  /** When false, show the rule but do not drag (home template). */
  resizable?: boolean;
  fixedRatio?: number;
  /** Left pane minimum share when resizing (e.g. 0.5 = notes stay at least half). */
  minRatio?: number;
  maxRatio?: number;
}) {
  const paneId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const ratioMin = Math.min(minRatio, maxRatio);
  const ratioMax = Math.max(minRatio, maxRatio);
  const lockedRatio = clampRatio(fixedRatio ?? DEFAULT_RATIO, ratioMin, ratioMax);
  const [ratio, setRatio] = useState(lockedRatio);
  const [dragging, setDragging] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const draggingRef = useRef(false);
  const canResize = resizable ?? divider !== "draft";
  const draft = divider === "draft";

  useEffect(() => {
    if (!canResize) {
      setRatio(lockedRatio);
      return;
    }
    setRatio(readStoredRatio(storageKey, ratioMin, ratioMax));
  }, [canResize, lockedRatio, ratioMax, ratioMin, storageKey]);

  // Keep ratio in sync when another Scale Studio surface updates the shared key.
  useEffect(() => {
    if (!canResize || !storageKey) return;
    const sync = () => {
      setRatio(readStoredRatio(storageKey, ratioMin, ratioMax));
    };
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, [canResize, ratioMax, ratioMin, storageKey]);

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
      if (!storageKey || !canResize) return;
      try {
        window.localStorage.setItem(storageKey, String(next));
        if (storageKey === MUSAI_SCALE_SPLIT_STORAGE_KEY) {
          for (const legacy of LEGACY_SPLIT_KEYS) {
            window.localStorage.setItem(legacy, String(next));
          }
        }
      } catch {
        /* ignore */
      }
    },
    [canResize, storageKey],
  );

  const setRatioFromClientX = useCallback(
    (clientX: number) => {
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      if (rect.width < 1) return;
      const next = clampRatio((clientX - rect.left) / rect.width, ratioMin, ratioMax);
      setRatio(next);
      persist(next);
    },
    [persist, ratioMax, ratioMin],
  );

  useEffect(() => {
    if (!dragging || !canResize) return;

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
  }, [canResize, dragging, setRatioFromClientX]);

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
    if (!canResize) return;
    const step = e.shiftKey ? 0.08 : 0.03;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setRatio((r) => {
        const next = clampRatio(r - step, ratioMin, ratioMax);
        persist(next);
        return next;
      });
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setRatio((r) => {
        const next = clampRatio(r + step, ratioMin, ratioMax);
        persist(next);
        return next;
      });
    } else if (e.key === "Home") {
      e.preventDefault();
      const next = clampRatio(DEFAULT_RATIO, ratioMin, ratioMax);
      setRatio(next);
      persist(next);
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
      className={`relative flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden ${className}`.trim()}
    >
      <div
        className="flex min-h-0 min-w-0 flex-col max-md:h-auto max-md:flex-none max-md:overflow-visible md:h-full md:min-w-[12rem] md:flex-1 md:overflow-hidden"
        style={leftStyle}
      >
        {left}
      </div>

      {canResize ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-controls={paneId}
          aria-valuenow={Math.round(ratio * 100)}
          aria-valuemin={Math.round(ratioMin * 100)}
          aria-valuemax={Math.round(ratioMax * 100)}
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
          className={`relative z-10 hidden shrink-0 touch-none self-stretch md:flex md:w-5 md:cursor-col-resize md:items-stretch md:justify-center ${
            dragging
              ? "bg-[color-mix(in_srgb,var(--musai-accent)_10%,transparent)]"
              : ""
          }`}
        >
          <DividerMarks draft={draft} dragging={dragging} />
        </div>
      ) : (
        <div
          className="relative z-10 hidden h-full min-h-0 shrink-0 self-stretch md:block md:w-5"
          aria-hidden
        >
          <DividerMarks draft={draft} dragging={false} />
        </div>
      )}

      <div
        id={paneId}
        className="flex min-h-0 min-w-0 flex-col max-md:h-auto max-md:flex-none max-md:overflow-visible md:h-full md:min-w-[12rem] md:flex-1 md:overflow-hidden"
        style={rightStyle}
      >
        {right}
      </div>
    </div>
  );
}
