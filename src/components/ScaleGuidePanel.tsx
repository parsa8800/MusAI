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
}: {
  guide: ScalePracticeGuideModel;
  exerciseMidis: number[];
  tonicPitchClass: number;
  scaleKind: ScaleKind;
  octaveSpan: 1 | 2;
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

  return (
    <div data-scale-info-root={INFO_ID} className="space-y-5 sm:space-y-6">
      <div className="relative flex min-h-[2.75rem] flex-col items-center justify-center px-10 sm:px-12">
        <h2
          ref={titleRef}
          className="sr-only"
        >
          {guide.scaleLabel} · {kindWord} · {spanWord}
        </h2>
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

      <div className="-mx-1 px-1 sm:-mx-2 sm:px-2">
        <ScaleTrebleStaff
          ascendingMidis={ascendingMidis}
          descendingMidis={descendingMidis}
          tonicPitchClass={tonicPitchClass}
          scaleKind={scaleKind}
        />
      </div>
    </div>
  );
}
