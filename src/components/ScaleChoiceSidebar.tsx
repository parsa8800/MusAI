"use client";

import { animate } from "animejs";
import { useEffect, useMemo, useRef } from "react";
import { KeySignatureMini } from "@/components/KeySignatureMini";
import { MusaiSegmentedControl } from "@/components/MusaiSegmentedControl";
import type { ScaleKind } from "@/lib/scales";
import {
  accidentalBadge,
  accidentalMarks,
  tonicAccidentalRows,
  type TonicAccidentalOption,
} from "@/lib/scales";
import { MUSAI_DUR, MUSAI_EASE, prefersReducedMotion } from "@/lib/motion";

export type ScaleMotion = "ascending" | "up_down";

type Props = {
  tonicPc: number;
  onTonicPc: (pitchClass: number) => void;
  scaleKind: ScaleKind;
  onScaleKind: (kind: ScaleKind) => void;
  octaveSpan: 1 | 2;
  onOctaveSpan: (span: 1 | 2) => void;
  scaleMotion?: ScaleMotion;
  onScaleMotion?: (motion: ScaleMotion) => void;
  /**
   * `fit` = short chips (letter + ♭/♯ marks) above the live staff.
   * `compact` = denser board under a staff.
   */
  density?: "default" | "compact" | "fit";
};

function partitionKeys(rows: ReturnType<typeof tonicAccidentalRows>): {
  natural: TonicAccidentalOption | null;
  pairs: {
    count: number;
    flat: TonicAccidentalOption | null;
    sharp: TonicAccidentalOption | null;
  }[];
} {
  let natural: TonicAccidentalOption | null = null;
  const byCount = new Map<
    number,
    { flat: TonicAccidentalOption | null; sharp: TonicAccidentalOption | null }
  >();

  for (const row of rows) {
    for (const key of row.keys) {
      if (key.accidentalKind === "natural" || key.accidentalCount === 0) {
        natural = key;
        continue;
      }
      const slot = byCount.get(key.accidentalCount) ?? {
        flat: null,
        sharp: null,
      };
      if (key.accidentalKind === "flat") slot.flat = key;
      else slot.sharp = key;
      byCount.set(key.accidentalCount, slot);
    }
  }

  const pairs = [...byCount.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([count, slot]) => ({ count, ...slot }));

  return { natural, pairs };
}

function KeyButton({
  option,
  selected,
  family,
  onSelect,
  scaleKind,
  mode,
}: {
  option: TonicAccidentalOption;
  selected: boolean;
  family: "flat" | "sharp" | "natural";
  onSelect: () => void;
  scaleKind: ScaleKind;
  mode: "plain" | "marks" | "sig";
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`musai-key-btn musai-key-btn--${family}${
        mode === "marks"
          ? " musai-key-btn--marks"
          : mode === "sig"
            ? " musai-key-btn--with-sig musai-key-btn--inline-sig"
            : ""
      }`}
      aria-pressed={selected}
      aria-label={`${option.label} ${scaleKind === "major" ? "major" : "minor"}, ${accidentalBadge(option)}`}
    >
      <span className="musai-key-btn__letter">{option.label}</span>
      {mode === "marks" ? (
        <span className="musai-key-btn__marks" aria-hidden>
          {accidentalMarks(option)}
        </span>
      ) : null}
      {mode === "sig" ? (
        <KeySignatureMini
          option={option}
          scaleKind={scaleKind}
          size="md"
          className="musai-key-btn__sig"
        />
      ) : null}
    </button>
  );
}

/**
 * Key picker: flats left, sharps right, natural centered.
 */
export function ScaleChoiceSidebar({
  tonicPc,
  onTonicPc,
  scaleKind,
  onScaleKind,
  octaveSpan,
  onOctaveSpan,
  scaleMotion = "up_down",
  onScaleMotion,
  density = "default",
}: Props) {
  const rows = tonicAccidentalRows(scaleKind);
  const { natural, pairs } = useMemo(() => partitionKeys(rows), [rows]);
  const listRef = useRef<HTMLDivElement>(null);
  const prevPc = useRef(tonicPc);
  const compact = density === "compact";
  const fit = density === "fit";
  const rowControls = compact || fit;
  const chipMode: "plain" | "marks" | "sig" = fit
    ? "marks"
    : compact
      ? "plain"
      : "sig";

  useEffect(() => {
    if (prevPc.current === tonicPc) return;
    prevPc.current = tonicPc;
    const root = listRef.current;
    if (!root || prefersReducedMotion()) return;
    const selected = root.querySelector<HTMLElement>("[aria-pressed='true']");
    if (!selected) return;

    const anim = animate(selected, {
      scale: [0.94, 1],
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
  }, [tonicPc]);

  return (
    <aside
      className={`relative mx-auto w-full text-center ${
        fit
          ? "max-w-md px-0 py-0"
          : compact
            ? "max-w-sm px-0 py-0"
            : "px-0.5 py-1 sm:px-1"
      }`}
    >
      <div
        className={
          rowControls
            ? "flex flex-wrap items-center justify-center gap-1"
            : "space-y-2"
        }
      >
        <MusaiSegmentedControl<ScaleKind>
          ariaLabel="Scale type"
          value={scaleKind}
          onChange={onScaleKind}
          options={[
            { value: "major", label: "Major" },
            { value: "natural_minor", label: "Minor" },
          ]}
          className={rowControls ? "min-w-0 flex-1" : "w-full"}
          size="compact"
        />
        <MusaiSegmentedControl<1 | 2>
          ariaLabel="Octave span"
          value={octaveSpan}
          onChange={onOctaveSpan}
          options={[
            { value: 1, label: "1 oct" },
            { value: 2, label: "2 oct" },
          ]}
          className={rowControls ? "min-w-0 flex-1" : "w-full"}
          size="compact"
        />
        {onScaleMotion ? (
          <MusaiSegmentedControl<ScaleMotion>
            ariaLabel="Scale direction"
            value={scaleMotion}
            onChange={onScaleMotion}
            options={[
              { value: "ascending", label: "Only up" },
              { value: "up_down", label: "Up & down" },
            ]}
            className={rowControls ? "min-w-0 flex-[1.2]" : "w-full"}
            size="compact"
          />
        ) : null}
      </div>

      <div
        ref={listRef}
        className={`musai-key-board ${
          fit
            ? "musai-key-board--fit mt-2"
            : compact
              ? "musai-key-board--compact mt-1.5"
              : "mt-4"
        }`}
        role="group"
        aria-label="Key"
      >
        {natural ? (
          <div className="musai-key-natural-slot">
            <KeyButton
              option={natural}
              selected={tonicPc === natural.pitchClass}
              family="natural"
              scaleKind={scaleKind}
              mode={chipMode}
              onSelect={() => onTonicPc(natural.pitchClass)}
            />
          </div>
        ) : null}

        <div className="musai-key-col-head musai-key-col-head--flat">
          <span aria-hidden>♭</span>
          <span>Flats</span>
        </div>
        <div className="musai-key-count-head" title="Number of flats or sharps">
          #
        </div>
        <div className="musai-key-col-head musai-key-col-head--sharp">
          <span aria-hidden>♯</span>
          <span>Sharps</span>
        </div>

        {pairs.map(({ count, flat, sharp }) => (
          <div key={`acc-${count}`} className="contents">
            {flat ? (
              <KeyButton
                option={flat}
                selected={tonicPc === flat.pitchClass}
                family="flat"
                scaleKind={scaleKind}
                mode={chipMode}
                onSelect={() => onTonicPc(flat.pitchClass)}
              />
            ) : (
              <span className="musai-key-empty" aria-hidden />
            )}
            <span
              className="musai-key-count"
              title={`${count} flat${count === 1 ? "" : "s"} / ${count} sharp${count === 1 ? "" : "s"}`}
            >
              {count}
            </span>
            {sharp ? (
              <KeyButton
                option={sharp}
                selected={tonicPc === sharp.pitchClass}
                family="sharp"
                scaleKind={scaleKind}
                mode={chipMode}
                onSelect={() => onTonicPc(sharp.pitchClass)}
              />
            ) : (
              <span className="musai-key-empty" aria-hidden />
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
