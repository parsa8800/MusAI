"use client";

import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

const TRIGGER_CLASS =
  "flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/[0.12] bg-black/35 text-[16px] font-semibold leading-none tracking-tight text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-xl transition-[transform,background-color,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-white/[0.16] hover:bg-black/42 active:scale-[0.94] motion-reduce:transition-none motion-reduce:active:scale-100";

const PANEL_CLASS =
  "musai-info-popover-panel fixed z-[380] max-h-[min(72vh,520px)] w-[min(288px,calc(100vw-1.5rem))] origin-top overflow-y-auto overscroll-contain rounded-2xl border border-white/[0.1] bg-zinc-950/[0.94] p-4 text-left opacity-0 shadow-[0_20px_56px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-2xl motion-reduce:animate-none";

const TITLE_BY_ACCENT = {
  emerald:
    "text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400/90",
  sky: "text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-400/90",
  violet:
    "text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-400/90",
  zinc: "text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500",
} as const;

export type InfoPopoverTitleAccent = keyof typeof TITLE_BY_ACCENT;

export type InfoPopoverStep = {
  text: string;
  badge: "emerald" | "fuchsia" | "zinc";
};

const STEP_BADGE: Record<
  InfoPopoverStep["badge"],
  string
> = {
  emerald:
    "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-[10px] font-bold text-emerald-400/95 ring-1 ring-emerald-500/25",
  fuchsia:
    "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-fuchsia-500/15 text-[10px] font-bold text-fuchsia-300/95 ring-1 ring-fuchsia-500/25",
  zinc: "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-[10px] font-bold text-zinc-500 ring-1 ring-white/10",
};

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function InfoPopoverNumberedSteps({
  steps,
}: {
  steps: InfoPopoverStep[];
}) {
  return (
    <ul className="mt-3.5 list-none space-y-3 text-[12px] leading-relaxed text-zinc-400">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span className={STEP_BADGE[s.badge]}>{i + 1}</span>
          <span>{s.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function InfoPopoverBulletList({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[12px] leading-relaxed text-zinc-400">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

/** Minimal scannable lines (no bullets / numbers). */
export function InfoPopoverScanLines({ lines }: { lines: string[] }) {
  return (
    <ul className="mt-2.5 list-none space-y-2 text-[13px] font-medium leading-snug tracking-tight text-zinc-300">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

type InfoPopoverProps = {
  title: string;
  titleAccent?: InfoPopoverTitleAccent;
  /** Accessible name for the trigger (e.g. "Reference tone help"). */
  ariaLabel: string;
  children: ReactNode;
  /** Controlled open state */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Stop mousedown from bubbling (e.g. scale staff hit targets). */
  stopTriggerPointerDown?: boolean;
  className?: string;
};

export function InfoPopover({
  title,
  titleAccent = "emerald",
  ariaLabel,
  children,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  stopTriggerPointerDown = false,
  className = "",
}: InfoPopoverProps) {
  const titleId = useId().replace(/:/g, "");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const isClient = useIsClient();

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(next);
      }
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const reposition = useCallback(() => {
    const tri = triggerRef.current?.getBoundingClientRect();
    const pan = panelRef.current;
    if (!tri || !pan) return;

    const margin = 12;
    const gap = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const panelW = Math.min(288, vw - margin * 2);
    const ph = pan.getBoundingClientRect().height;
    const panelH = ph > 8 ? ph : 280;

    let left = tri.right - panelW;
    left = Math.max(margin, Math.min(left, vw - panelW - margin));

    let top = tri.bottom + gap;
    if (top + panelH > vh - margin) {
      top = tri.top - panelH - gap;
    }
    if (top < margin) {
      top = margin;
    }

    pan.style.top = `${top}px`;
    pan.style.left = `${left}px`;
    pan.style.opacity = "1";
    pan.style.pointerEvents = "auto";
  }, []);

  useLayoutEffect(() => {
    if (!open || !isClient) return;
    const pan = panelRef.current;
    if (pan) {
      pan.style.opacity = "0";
      pan.style.pointerEvents = "none";
    }

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      reposition();
      raf2 = requestAnimationFrame(() => reposition());
    });

    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);

    const el = panelRef.current;
    const ro =
      el && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => reposition())
        : null;
    if (el && ro) ro.observe(el);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      ro?.disconnect();
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, isClient, reposition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
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
  }, [open, setOpen]);

  const toggle = () => setOpen(!open);

  const panel = open ? (
    <div
      ref={panelRef}
      data-musai-info-popover=""
      className={PANEL_CLASS}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <p id={titleId} className={TITLE_BY_ACCENT[titleAccent]}>
        {title}
      </p>
      {children}
    </div>
  ) : null;

  return (
    <div className={`relative z-20 shrink-0 ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? titleId : undefined}
        aria-label={ariaLabel}
        onClick={toggle}
        onMouseDown={
          stopTriggerPointerDown
            ? (e) => {
                e.stopPropagation();
              }
            : undefined
        }
        className={TRIGGER_CLASS}
        style={{ fontFamily: "ui-serif, Georgia, 'Times New Roman', serif" }}
      >
        i
      </button>
      {isClient && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
