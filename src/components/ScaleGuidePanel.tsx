"use client";

import { animate } from "animejs";
import { useEffect, useRef } from "react";
import { InfoPopover, InfoPopoverScanLines } from "@/components/InfoPopover";
import { ScalePitchCueKey } from "@/components/ScalePitchCueKey";
import { useScalePracticeInfo } from "@/components/scalePracticeInfoContext";
import { ScaleTrebleStaff } from "@/components/ScaleTrebleStaff";
import {
  scaleRecordingTips,
  type ScalePracticeGuideModel,
} from "@/lib/scalePracticeGuide";
import type { ScaleKind } from "@/lib/scales";
import { workspaceTitle } from "@/lib/scaleWorkspace";
import { MUSAI_DUR, MUSAI_EASE, prefersReducedMotion } from "@/lib/motion";

const INFO_ID = "scale-guide";

export function ScaleGuidePanel({
  guide,
  exerciseMidis,
  tonicPitchClass,
  scaleKind,
  octaveSpan,
  ascendingCents,
  descendingCents,
  compact = false,
  density = "default",
  showSectionLabels = true,
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
  /** Home pick mode: smaller title, denser stack. */
  density?: "default" | "pad";
  /** Hide Ascending / Descending captions on the staff. */
  showSectionLabels?: boolean;
}) {
  const ascendingMidis = exerciseMidis.slice(0, guide.ascendingCount);
  const descendingMidis = exerciseMidis.slice(guide.ascendingCount);
  const { openOrToggle, isOpen, close } = useScalePracticeInfo();
  const infoOpen = isOpen(INFO_ID);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const prevLabel = useRef(guide.scaleLabel);
  const prevSpan = useRef(octaveSpan);
  const pad = density === "pad";
  const tight = compact || pad;

  useEffect(() => {
    if (prevLabel.current === guide.scaleLabel && prevSpan.current === octaveSpan)
      return;
    prevLabel.current = guide.scaleLabel;
    prevSpan.current = octaveSpan;
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
  }, [guide.scaleLabel, octaveSpan]);

  const displayTitle =
    descendingMidis.length === 0
      ? `${workspaceTitle(guide.scaleLabel, octaveSpan)} · up`
      : workspaceTitle(guide.scaleLabel, octaveSpan);
  const showFeedbackLegend =
    ascendingCents != null || descendingCents != null;

  return (
    <div
      data-scale-info-root={INFO_ID}
      className={
        tight
          ? `flex h-full min-h-0 flex-col ${pad ? "gap-1" : "gap-2"}`
          : "space-y-4 sm:space-y-5"
      }
    >
      <div
        className={`relative flex shrink-0 items-start justify-center ${
          pad ? "px-2" : compact ? "px-2 sm:px-3" : "px-4 sm:px-6"
        }`}
      >
        <div className="min-w-0 text-center">
          <h2
            ref={titleRef}
            className={`font-display font-semibold tracking-tight text-[var(--musai-ink)] ${
              pad
                ? "text-lg leading-tight sm:text-xl"
                : compact
                  ? "text-2xl leading-tight sm:text-3xl"
                  : "text-2xl sm:text-3xl"
            }`}
          >
            {displayTitle}
          </h2>
        </div>
        <div
          className="absolute right-0 top-0 shrink-0"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <InfoPopover
            title="Before you record"
            titleAccent="zinc"
            ariaLabel="How to record this scale"
            open={infoOpen}
            onOpenChange={(next) => {
              if (next === infoOpen) return;
              if (next) openOrToggle(INFO_ID);
              else close();
            }}
            stopTriggerPointerDown
          >
            <InfoPopoverScanLines
              lines={scaleRecordingTips(descendingMidis.length > 0)}
            />
          </InfoPopover>
        </div>
      </div>

      <div
        className={`min-h-0 ${
          tight
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
          density={pad ? "pad" : "default"}
          showSectionLabels={showSectionLabels}
        />
      </div>

      {showFeedbackLegend ? (
        <ScalePitchCueKey compact={tight} />
      ) : null}
    </div>
  );
}
