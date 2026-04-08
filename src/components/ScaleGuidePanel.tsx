"use client";

import { useId } from "react";
import { useScalePracticeInfo } from "@/components/scalePracticeInfoContext";
import { ScaleTrebleStaff } from "@/components/ScaleTrebleStaff";
import type { ScalePracticeGuideModel } from "@/lib/scalePracticeGuide";
import type { ScaleKind } from "@/lib/scales";

const INFO_ID = "scale-guide";

export function ScaleGuidePanel({
  guide,
  exerciseMidis,
  tonicPitchClass,
  scaleKind,
}: {
  guide: ScalePracticeGuideModel;
  exerciseMidis: number[];
  tonicPitchClass: number;
  scaleKind: ScaleKind;
}) {
  const ascendingMidis = exerciseMidis.slice(0, guide.ascendingCount);
  const descendingMidis = exerciseMidis.slice(guide.ascendingCount);
  const { openOrToggle, isOpen } = useScalePracticeInfo();
  const infoOpen = isOpen(INFO_ID);
  const infoId = useId();

  return (
    <div data-scale-info-root={INFO_ID} className="space-y-10 sm:space-y-14">
      <div className="relative flex min-h-[3.25rem] items-start justify-center px-10 sm:px-12">
        <h2 className="text-center text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          {guide.scaleLabel}
        </h2>
        <div className="absolute right-0 top-0 shrink-0">
          <button
            type="button"
            aria-expanded={infoOpen}
            aria-controls={infoId}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-[11px] font-semibold text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:bg-white/[0.06] hover:text-zinc-200"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              openOrToggle(INFO_ID);
            }}
          >
            i
          </button>
          {infoOpen ? (
            <div
              id={infoId}
              className="absolute right-0 top-10 z-30 w-[min(300px,90vw)] rounded-2xl border border-white/10 bg-zinc-950/90 p-4 text-left shadow-[0_24px_64px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl"
              role="dialog"
              aria-label="Scale practice details"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                Quick tips
              </p>
              <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs text-zinc-400">
                <li>Play up to the top note, then come back down.</li>
                <li>Keep steady timing — one note per beat is ideal.</li>
                <li>Avoid skipping notes.</li>
              </ul>
            </div>
          ) : null}
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
