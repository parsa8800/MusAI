"use client";

import { animate } from "animejs";
import { useEffect, useRef } from "react";
import { InfoPopover, InfoPopoverScanLines } from "@/components/InfoPopover";
import { useScalePracticeInfo } from "@/components/scalePracticeInfoContext";
import { ScaleTrebleStaff } from "@/components/ScaleTrebleStaff";
import type { ScalePracticeGuideModel } from "@/lib/scalePracticeGuide";
import type { ScaleKind } from "@/lib/scales";
import { MUSAI_DUR, MUSAI_EASE, prefersReducedMotion } from "@/lib/motion";

const INFO_ID = "scale-guide";

const SCALE_QUICK_TIPS = [
  "Up to the top, then down",
  "Keep the beat steady",
  "Don’t skip notes",
];

export function ScaleGuidePanel({
  guide,
  exerciseMidis,
  tonicPitchClass,
  scaleKind,
  octaveSpan,
  ascendingCents,
  descendingCents,
  compact = false,
  focusStrong,
  focusNext,
}: {
  guide: ScalePracticeGuideModel;
  exerciseMidis: number[];
  tonicPitchClass: number;
  scaleKind: ScaleKind;
  octaveSpan: 1 | 2;
  /** Optional intonation colouring from the latest take. */
  ascendingCents?: (number | null)[];
  descendingCents?: (number | null)[];
  /** Pad workspace: tighter chrome so staff + coach fit one viewport. */
  compact?: boolean;
  /** Short “what went well” under the staff after a take. */
  focusStrong?: string | null;
  /** Short “what to work on” under the staff after a take. */
  focusNext?: string | null;
}) {
  const ascendingMidis = exerciseMidis.slice(0, guide.ascendingCount);
  const descendingMidis = exerciseMidis.slice(guide.ascendingCount);
  const { openOrToggle, isOpen, close } = useScalePracticeInfo();
  const infoOpen = isOpen(INFO_ID);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const prevLabel = useRef(guide.scaleLabel);

  useEffect(() => {
    if (prevLabel.current === guide.scaleLabel) return;
    prevLabel.current = guide.scaleLabel;
    const el = titleRef.current;
    if (!el || prefersReducedMotion()) return;

    const anim = animate(el, {
      opacity: [0.35, 1],
      y: [6, 0],
      duration: MUSAI_DUR.fast,
      ease: MUSAI_EASE.out,
    });

    return () => {
      try {
        (anim as { pause: () => void; revert?: () => void }).pause();
        (anim as { revert?: () => void }).revert?.();
      } catch {
        /* cleanup */
      }
    };
  }, [guide.scaleLabel]);

  const kindWord = scaleKind === "major" ? "Major" : "Minor";
  const spanWord = octaveSpan === 2 ? "2 octaves" : "1 octave";
  const showFeedbackLegend =
    ascendingCents != null || descendingCents != null;

  return (
    <div
      data-scale-info-root={INFO_ID}
      className={
        compact
          ? "flex h-full min-h-0 flex-col gap-2"
          : "space-y-4 sm:space-y-5"
      }
    >
      <div
        className={`relative flex shrink-0 items-start justify-center ${
          compact ? "px-6" : "px-8 sm:px-10"
        }`}
      >
        <div className="min-w-0 text-center">
          <h2
            ref={titleRef}
            className={`font-display font-semibold tracking-tight text-[var(--musai-ink)] ${
              compact
                ? "text-lg sm:text-xl"
                : "text-xl sm:text-2xl"
            }`}
          >
            {guide.scaleLabel}
          </h2>
          <p className="mt-0.5 text-[11px] font-medium text-[var(--musai-muted)] sm:text-[12px]">
            {kindWord}
            <span className="text-[var(--musai-border)]"> · </span>
            {spanWord}
          </p>
        </div>
        <div
          className="absolute right-0 top-0 shrink-0"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <InfoPopover
            title="Tips"
            titleAccent="zinc"
            ariaLabel="Scale practice details"
            open={infoOpen}
            onOpenChange={(next) => {
              if (next === infoOpen) return;
              if (next) openOrToggle(INFO_ID);
              else close();
            }}
            stopTriggerPointerDown
          >
            <InfoPopoverScanLines lines={SCALE_QUICK_TIPS} />
          </InfoPopover>
        </div>
      </div>

      {showFeedbackLegend ? (
        <div
          className={`flex shrink-0 flex-wrap items-center justify-center gap-3 text-[11px] text-[var(--musai-muted)] ${
            compact ? "gap-2" : ""
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--musai-ok)]" /> On pitch
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--musai-warn)]" /> Sharp
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--musai-key-flat)]" /> Flat
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--musai-accent-2)]" /> Missed
          </span>
        </div>
      ) : null}

      <div
        className={`min-h-0 ${
          compact
            ? "flex-1 overflow-hidden -mx-1 px-1"
            : "-mx-1 px-1 sm:-mx-2 sm:px-2"
        }`}
      >
        <ScaleTrebleStaff
          ascendingMidis={ascendingMidis}
          descendingMidis={descendingMidis}
          ascendingCents={ascendingCents}
          descendingCents={descendingCents}
          tonicPitchClass={tonicPitchClass}
          scaleKind={scaleKind}
        />
      </div>

      {focusStrong || focusNext ? (
        <div
          className="shrink-0 space-y-2 px-1 text-center sm:px-2"
          aria-label="Take focus"
        >
          {focusStrong ? (
            <p className="text-[14px] leading-snug text-[var(--musai-ink)] sm:text-[15px]">
              <span className="font-semibold text-[var(--musai-ok)]">Strong</span>
              <span className="mx-1.5 text-[var(--musai-border)]">·</span>
              {focusStrong}
            </p>
          ) : null}
          {focusNext ? (
            <p className="text-[15px] font-medium leading-snug text-[var(--musai-ink)] sm:text-[16px]">
              <span className="font-semibold text-[var(--musai-key-sharp)]">
                Work on
              </span>
              <span className="mx-1.5 text-[var(--musai-border)]">·</span>
              {focusNext}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
