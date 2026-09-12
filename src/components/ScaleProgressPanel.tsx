"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { buildLoopMastery } from "@/lib/scalePracticeProgress";
import {
  formatLastPractised,
  listScaleProgressJourneys,
  type ScaleProgressJourneyV1,
} from "@/lib/scaleProgressHistory";
import { resetScaleProgressJourney } from "@/lib/scalePracticeSession";
import { scaleWorkspaceHref } from "@/lib/scaleWorkspace";
import { tapFeedback } from "@/lib/motion";

function octaveLabel(span: 1 | 2): string {
  return span === 2 ? "2 octaves" : "1 octave";
}

function ScaleSwitcherRow({
  journey,
  isCurrent,
  onContinue,
  onCurrent,
  onReset,
}: {
  journey: ScaleProgressJourneyV1;
  isCurrent: boolean;
  onContinue: (journey: ScaleProgressJourneyV1) => void;
  onCurrent?: () => void;
  onReset: (journey: ScaleProgressJourneyV1) => void;
}) {
  const mastery = buildLoopMastery(journey.attempts);
  const progress = Math.round(mastery.percent);
  const complete = progress >= 100;
  const takeCount = journey.attempts.length;
  const takeLabel = takeCount === 1 ? "1 take" : `${takeCount} takes`;
  const href = scaleWorkspaceHref(journey.scaleId, journey.lastOctaveSpan);
  const oct = octaveLabel(journey.lastOctaveSpan);
  const practised = formatLastPractised(journey.lastPractisedAt);
  const statusLabel = isCurrent
    ? "this page"
    : complete
      ? "complete"
      : `in progress, ${progress} percent`;

  const menuId = useId();
  const rootRef = useRef<HTMLLIElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen && !confirmOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      setMenuOpen(false);
      setConfirmOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      if (confirmOpen) {
        setConfirmOpen(false);
        return;
      }
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [confirmOpen, menuOpen]);

  const closeMenus = () => {
    setMenuOpen(false);
    setConfirmOpen(false);
  };

  const confirmReset = () => {
    tapFeedback("medium");
    resetScaleProgressJourney(journey.progressKey);
    closeMenus();
    onReset(journey);
  };

  return (
    <li ref={rootRef} className="relative">
      <Link
        href={href}
        aria-current={isCurrent ? "page" : undefined}
        aria-label={
          isCurrent
            ? `${journey.scaleLabel}, ${statusLabel}, ${oct}, ${takeLabel}`
            : `Continue ${journey.scaleLabel}, ${statusLabel}, ${oct}, ${takeLabel}`
        }
        className={`musai-scale-switcher__row${
          complete ? " musai-scale-switcher__row--complete" : ""
        }`}
        onClick={(e) => {
          if (isCurrent) {
            e.preventDefault();
            onCurrent?.();
            return;
          }
          onContinue(journey);
        }}
      >
        <span className="musai-scale-switcher__main">
          <span className="musai-scale-switcher__name">{journey.scaleLabel}</span>
          <span className="musai-scale-switcher__oct">{oct}</span>
          <span className="musai-scale-switcher__meta">
            <span className="musai-scale-switcher__takes">{takeLabel}</span>
            <span className="musai-scale-switcher__when">{practised}</span>
          </span>
        </span>

        <span className="musai-scale-switcher__stats">
          {isCurrent ? (
            <span className="musai-scale-switcher__here">Here</span>
          ) : complete ? (
            <span className="musai-scale-switcher__complete">
              <svg
                viewBox="0 0 24 24"
                className="musai-scale-switcher__check"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.4}
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 12.5l5 5L19 7"
                />
              </svg>
              Complete
            </span>
          ) : (
            <>
              <span className="musai-scale-switcher__state">In progress</span>
              <span className="musai-scale-switcher__best">{progress}%</span>
            </>
          )}
          {!isCurrent ? (
            <span className="musai-scale-switcher__meter" aria-hidden>
              <span
                style={{
                  width: `${Math.max(complete ? 100 : 4, Math.min(100, progress))}%`,
                }}
              />
            </span>
          ) : null}
        </span>

        {!isCurrent ? (
          <span className="musai-scale-switcher__go" aria-hidden>
            <span className="musai-scale-switcher__go-label">Continue</span>
            <svg
              viewBox="0 0 24 24"
              className="musai-scale-switcher__chevron"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </span>
        ) : null}
      </Link>

      <div className="musai-scale-switcher__actions">
        <button
          type="button"
          className="musai-pressable musai-scale-switcher__more"
          aria-label={`More actions for ${journey.scaleLabel}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen || confirmOpen}
          aria-controls={menuOpen ? menuId : undefined}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            tapFeedback("light");
            setConfirmOpen(false);
            setMenuOpen((open) => !open);
          }}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
            <circle cx="5" cy="12" r="1.7" />
            <circle cx="12" cy="12" r="1.7" />
            <circle cx="19" cy="12" r="1.7" />
          </svg>
        </button>

        {menuOpen && !confirmOpen ? (
          <div
            id={menuId}
            className="musai-scale-switcher__menu"
            role="menu"
            aria-label={`${journey.scaleLabel} actions`}
          >
            <button
              type="button"
              role="menuitem"
              className="musai-scale-switcher__menu-item"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                tapFeedback("light");
                setMenuOpen(false);
                setConfirmOpen(true);
              }}
            >
              Reset scale
            </button>
          </div>
        ) : null}
      </div>

      {confirmOpen ? (
        <div
          className="musai-scale-switcher__confirm"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${menuId}-confirm-title`}
          aria-describedby={`${menuId}-confirm-desc`}
        >
          <p
            id={`${menuId}-confirm-title`}
            className="musai-scale-switcher__confirm-title"
          >
            Reset {journey.scaleLabel}?
          </p>
          <p
            id={`${menuId}-confirm-desc`}
            className="musai-scale-switcher__confirm-copy"
          >
            This removes it from My scales so you can start again.
          </p>
          <div className="musai-scale-switcher__confirm-row">
            <button
              type="button"
              className="musai-pressable musai-scale-switcher__confirm-cancel"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setConfirmOpen(false);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="musai-pressable musai-scale-switcher__confirm-reset"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                confirmReset();
              }}
            >
              Reset
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/**
 * Saved scale journeys — selectable cards a child can open again.
 */
export function ScaleProgressPanel({
  revision = 0,
  onContinue,
  onJourneyReset,
  currentProgressKey,
  title = "My scales",
  subtitle = "Scales you’ve already practised. Tap one to keep going.",
  framed = false,
  onDismiss,
  titleId,
}: {
  /** Bump after new attempts so the list refreshes. */
  revision?: number;
  onContinue: (journey: ScaleProgressJourneyV1) => void;
  /** Fired after a scale’s stored takes and progress are cleared. */
  onJourneyReset?: (journey: ScaleProgressJourneyV1) => void;
  /** Mark the open workspace so it isn’t a duplicate destination. */
  currentProgressKey?: string;
  title?: string;
  subtitle?: string;
  titleId?: string;
  /** Standalone glass frame (legacy practice flow). */
  framed?: boolean;
  onDismiss?: () => void;
}) {
  const [journeys, setJourneys] = useState<ScaleProgressJourneyV1[] | null>(
    null,
  );

  useEffect(() => {
    setJourneys(listScaleProgressJourneys());
  }, [revision]);

  const loading = journeys === null;
  const empty = !loading && journeys.length === 0;

  return (
    <section
      className={`musai-scale-switcher${framed ? " musai-scale-switcher--framed" : ""}`}
      aria-label={title}
    >
      <div className="musai-scale-switcher__head">
        <div className="musai-scale-switcher__copy">
          <h2 id={titleId} className="musai-scale-switcher__title font-display">
            {title}
          </h2>
          <p className="musai-scale-switcher__subtitle">{subtitle}</p>
        </div>
        {onDismiss ? (
          <button
            type="button"
            className="musai-pressable musai-scale-switcher__close"
            aria-label="Close scales"
            onClick={onDismiss}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              aria-hidden
            >
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-8">
          <div
            className="h-7 w-7 rounded-full border-2 border-transparent border-t-[var(--musai-accent)] motion-safe:animate-spin motion-reduce:animate-none"
            aria-hidden
          />
        </div>
      ) : empty ? (
        <div className="musai-scale-switcher__empty">
          <p className="text-[14px] font-semibold text-[var(--musai-ink)]">
            No scales yet
          </p>
          <p className="max-w-[16rem] text-[12px] leading-snug text-[var(--musai-muted)]">
            Record a scale and it will appear here so you can come back.
          </p>
        </div>
      ) : (
        <ul className="musai-scroll musai-scale-switcher__list">
          {journeys.map((j) => (
            <ScaleSwitcherRow
              key={j.progressKey}
              journey={j}
              isCurrent={currentProgressKey === j.progressKey}
              onContinue={onContinue}
              onCurrent={onDismiss}
              onReset={(journey) => {
                setJourneys(listScaleProgressJourneys());
                onJourneyReset?.(journey);
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
