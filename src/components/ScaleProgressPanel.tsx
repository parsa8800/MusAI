"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { KeySignatureMini } from "@/components/KeySignatureMini";
import { MusaiLoadingMark } from "@/components/MusaiLoadingMark";
import { useInstrument } from "@/components/InstrumentProvider";
import { buildLoopMastery } from "@/lib/scalePracticeProgress";
import {
  listScaleProgressJourneys,
  type ScaleProgressJourneyV1,
} from "@/lib/scaleProgressHistory";
import { preferredTonicOption, type TonicAccidentalOption } from "@/lib/scales";
import { scaleWorkspaceHref } from "@/lib/scaleWorkspace";

function keySignatureSpoken(option: TonicAccidentalOption): string {
  if (option.accidentalKind === "natural" || option.accidentalCount === 0) {
    return "no sharps or flats";
  }
  const count = option.accidentalCount;
  const word = option.accidentalKind === "sharp" ? "sharp" : "flat";
  return count === 1 ? `1 ${word}` : `${count} ${word}s`;
}

function ScaleSwitcherRow({
  journey,
  isCurrent,
  onContinue,
  onCurrent,
}: {
  journey: ScaleProgressJourneyV1;
  isCurrent: boolean;
  onContinue: (journey: ScaleProgressJourneyV1) => void;
  onCurrent?: () => void;
}) {
  const mastery = buildLoopMastery(journey.attempts);
  const progress = Math.round(mastery.percent);
  const complete = progress >= 100;
  const href = scaleWorkspaceHref(journey.scaleId, journey.lastOctaveSpan);
  const keyOption = preferredTonicOption(journey.tonicPitchClass, journey.scaleKind);
  const keySpoken = keySignatureSpoken(keyOption);
  const statusLabel = isCurrent ? "this page" : complete ? "complete" : "in progress";

  return (
    <li className="musai-scale-switcher__entry">
      <Link
        href={href}
        aria-current={isCurrent ? "page" : undefined}
        aria-label={
          isCurrent
            ? `${journey.scaleLabel}, ${statusLabel}, ${keySpoken}`
            : `Continue ${journey.scaleLabel}, ${statusLabel}, ${keySpoken}`
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
          <KeySignatureMini
            option={keyOption}
            scaleKind={journey.scaleKind}
            size="chip"
          />
          <span className="musai-scale-switcher__name">{journey.scaleLabel}</span>
          <span
            className="musai-scale-switcher__meter"
            data-progress={progress}
            aria-hidden
          >
            <span
              style={{
                width: `${Math.max(complete ? 100 : 4, Math.min(100, progress))}%`,
              }}
            />
          </span>
        </span>
      </Link>
    </li>
  );
}

/**
 * Saved scale journeys — selectable cards a child can open again.
 */
export function ScaleProgressPanel({
  revision = 0,
  onContinue,
  currentProgressKey,
  title = "My scales",
  subtitle,
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
  const { instrument } = useInstrument();
  const [journeys, setJourneys] = useState<ScaleProgressJourneyV1[] | null>(
    null,
  );

  useEffect(() => {
    setJourneys(listScaleProgressJourneys(instrument.id));
  }, [revision, instrument.id]);

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
          {subtitle ? (
            <p className="musai-scale-switcher__subtitle">{subtitle}</p>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-6">
          <MusaiLoadingMark compact />
        </div>
      ) : empty ? (
        <div className="musai-scale-switcher__empty">
          <p className="text-[14px] font-medium text-[var(--musai-muted)]">
            No scales yet
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
            />
          ))}
        </ul>
      )}
    </section>
  );
}
