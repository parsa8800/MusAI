"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ScaleProgressPanel } from "@/components/ScaleProgressPanel";
import type { ScaleProgressJourneyV1 } from "@/lib/scaleProgressHistory";

type Props = {
  open: boolean;
  onClose: () => void;
  id: string;
  title: string;
  subtitle: string;
  revision?: number;
  currentProgressKey?: string;
  onContinue: (journey: ScaleProgressJourneyV1) => void;
  onJourneyReset?: (journey: ScaleProgressJourneyV1) => void;
  newScaleHref?: string;
};

/**
 * Floating glass scale switcher — Voice Memos / Settings-sheet feel.
 */
export function ScaleSwitcherDrawer({
  open,
  onClose,
  id,
  title,
  subtitle,
  revision,
  currentProgressKey,
  onContinue,
  onJourneyReset,
  newScaleHref,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      className="musai-scales-switcher"
      data-open={open ? "true" : "false"}
      aria-hidden={open ? undefined : true}
    >
      <button
        type="button"
        className="musai-scales-switcher__scrim"
        tabIndex={open ? 0 : -1}
        aria-label="Close scales"
        onClick={onClose}
      />
      <aside
        id={id}
        className="musai-scales-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
      >
        <ScaleProgressPanel
          revision={revision}
          onContinue={onContinue}
          onJourneyReset={onJourneyReset}
          currentProgressKey={currentProgressKey}
          title={title}
          subtitle={subtitle}
          titleId={`${id}-title`}
          onDismiss={onClose}
        />
        {newScaleHref ? (
          <Link
            href={newScaleHref}
            className="musai-pressable musai-scale-switcher__new"
            tabIndex={open ? 0 : -1}
            onClick={onClose}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              aria-hidden
            >
              <path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </svg>
            New scale
          </Link>
        ) : null}
      </aside>
    </div>
  );
}
