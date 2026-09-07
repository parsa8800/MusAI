"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AnimatedReveal } from "@/components/motion/AnimatedReveal";
import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import { ScaleChoiceSidebar } from "@/components/ScaleChoiceSidebar";
import { ScaleGuidePanel } from "@/components/ScaleGuidePanel";
import { ScalePracticeInfoProvider } from "@/components/scalePracticeInfoContext";
import { ScaleProgressPanel } from "@/components/ScaleProgressPanel";
import { ScaleStudioHeader } from "@/components/ScaleStudioHeader";
import {
  identityFromSelection,
  scaleWorkspaceHref,
} from "@/lib/scaleWorkspace";
import type { ScaleProgressJourneyV1 } from "@/lib/scaleProgressHistory";
import type { ScaleKind } from "@/lib/scales";
import { buildScalePracticeGuideModel } from "@/lib/scalePracticeGuide";
import {
  buildExerciseScaleMidis,
  defaultRootMidiForTonic,
} from "@/lib/scales";

/**
 * Scale Studio home: pick a scale/octave, open its persistent workspace,
 * or continue from Progress.
 */
export function ScaleStudioSelector() {
  const router = useRouter();
  const [tonicPc, setTonicPc] = useState(0);
  const [scaleKind, setScaleKind] = useState<ScaleKind>("major");
  const defaultRoot = useMemo(
    () => defaultRootMidiForTonic(tonicPc),
    [tonicPc],
  );
  const [advRoot, setAdvRoot] = useState<number | null>(null);
  const [advSpan, setAdvSpan] = useState<1 | 2>(1);

  const selectTonicPc = (pc: number) => {
    setTonicPc(pc);
    setAdvRoot(null);
  };
  const selectScaleKind = (kind: ScaleKind) => {
    setScaleKind(kind);
    setAdvRoot(null);
  };

  const rootMidi = advRoot ?? defaultRoot;
  const octaveSpan = advSpan;
  const identity = identityFromSelection(tonicPc, scaleKind, octaveSpan);
  const expectedMidis = useMemo(
    () => buildExerciseScaleMidis(rootMidi, scaleKind, octaveSpan),
    [octaveSpan, rootMidi, scaleKind],
  );
  const guideModel = useMemo(
    () => buildScalePracticeGuideModel(tonicPc, scaleKind, rootMidi, octaveSpan),
    [octaveSpan, rootMidi, scaleKind, tonicPc],
  );

  const openWorkspace = () => {
    router.push(
      scaleWorkspaceHref(identity.scaleId, identity.octaveSpan, rootMidi),
    );
  };

  const continueJourney = (journey: ScaleProgressJourneyV1) => {
    router.push(
      scaleWorkspaceHref(
        journey.scaleId,
        journey.lastOctaveSpan,
        journey.lastRootMidi,
      ),
    );
  };

  return (
    <ScalePracticeInfoProvider>
      <div className="w-full max-w-[min(1280px,100%)]">
        <PracticeHubBackLink />
      </div>
      <ScaleStudioHeader />
      <AnimatedReveal className="w-full max-w-[min(1280px,100%)] space-y-6 sm:space-y-8">
        <p
          data-anime-enter
          className="mx-auto max-w-xl text-center text-[14px] leading-relaxed text-[var(--musai-muted)]"
        >
          Choose a scale to open its practice page — progress stays with that
          scale whenever you return.
        </p>

        <div className="mx-auto w-full max-w-md lg:hidden">
          <ScaleProgressPanel onContinue={continueJourney} />
        </div>

        <div className="musai-workspace relative mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-6">
          <div className="musai-studio-layout">
            <div className="musai-studio-layout__keys relative z-10">
              <ScaleChoiceSidebar
                tonicPc={tonicPc}
                onTonicPc={selectTonicPc}
                scaleKind={scaleKind}
                onScaleKind={selectScaleKind}
                octaveSpan={octaveSpan}
                onOctaveSpan={setAdvSpan}
                rootMidi={rootMidi}
                onRootMidi={setAdvRoot}
                onResetRange={() => setAdvRoot(null)}
              />
            </div>

            <div className="musai-studio-layout__notes min-w-0">
              <div className="mx-auto w-full max-w-3xl">
                <ScaleGuidePanel
                  guide={guideModel}
                  exerciseMidis={expectedMidis}
                  tonicPitchClass={tonicPc}
                  scaleKind={scaleKind}
                  octaveSpan={octaveSpan}
                />
              </div>
            </div>

            <div className="musai-studio-layout__capture">
              <div className="flex flex-col items-center gap-3 px-1 py-2">
                <button
                  type="button"
                  onClick={openWorkspace}
                  className="musai-btn-primary w-full max-w-[14rem]"
                >
                  Open practice
                </button>
                <p className="max-w-[14rem] text-center text-[11px] leading-snug text-[var(--musai-muted)]">
                  Same page layout — record beside the notes
                </p>
              </div>
            </div>

            <aside
              data-anime-enter
              className="pointer-events-none absolute top-16 right-0 hidden w-[14.5rem] translate-x-[calc(100%+1rem)] lg:block xl:hidden"
            >
              <div className="pointer-events-auto sticky top-24">
                <ScaleProgressPanel onContinue={continueJourney} />
              </div>
            </aside>
          </div>
        </div>

        <div className="mx-auto hidden w-full max-w-md xl:block">
          <ScaleProgressPanel onContinue={continueJourney} />
        </div>
      </AnimatedReveal>
    </ScalePracticeInfoProvider>
  );
}
