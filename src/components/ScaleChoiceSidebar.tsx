"use client";

import { animate } from "animejs";
import { useEffect, useMemo, useRef, useState } from "react";
import { MusaiSegmentedControl } from "@/components/MusaiSegmentedControl";
import type { ScaleKind } from "@/lib/scales";
import {
  accidentalBadge,
  describeRootChoice,
  tonicAccidentalRows,
  violinRootsForTonic,
  type TonicAccidentalOption,
} from "@/lib/scales";
import { MUSAI_DUR, MUSAI_EASE, prefersReducedMotion } from "@/lib/motion";

type Props = {
  tonicPc: number;
  onTonicPc: (pitchClass: number) => void;
  scaleKind: ScaleKind;
  onScaleKind: (kind: ScaleKind) => void;
  octaveSpan: 1 | 2;
  onOctaveSpan: (span: 1 | 2) => void;
  rootMidi: number;
  onRootMidi: (midi: number) => void;
  onResetRange: () => void;
};

function partitionKeys(rows: ReturnType<typeof tonicAccidentalRows>): {
  natural: TonicAccidentalOption | null;
  pairs: { count: number; flat: TonicAccidentalOption | null; sharp: TonicAccidentalOption | null }[];
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
}: {
  option: TonicAccidentalOption;
  selected: boolean;
  family: "flat" | "sharp" | "natural";
  onSelect: () => void;
  scaleKind: ScaleKind;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`musai-key-btn musai-key-btn--${family}`}
      aria-pressed={selected}
      aria-label={`${option.label} ${scaleKind === "major" ? "major" : "minor"}, ${accidentalBadge(option)}`}
    >
      {option.label}
    </button>
  );
}

/**
 * Key picker: flats (cool) left, sharps (warm) right, natural centered.
 * Middle gutter shows accidental count so order is readable at a glance.
 */
export function ScaleChoiceSidebar({
  tonicPc,
  onTonicPc,
  scaleKind,
  onScaleKind,
  octaveSpan,
  onOctaveSpan,
  rootMidi,
  onRootMidi,
  onResetRange,
}: Props) {
  const rows = tonicAccidentalRows(scaleKind);
  const { natural, pairs } = useMemo(() => partitionKeys(rows), [rows]);
  const listRef = useRef<HTMLDivElement>(null);
  const prevPc = useRef(tonicPc);
  const [rangeOpen, setRangeOpen] = useState(false);

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
    <aside className="relative w-full px-0.5 py-1 text-center sm:px-1">
      <div className="space-y-2">
        <MusaiSegmentedControl<ScaleKind>
          ariaLabel="Scale type"
          value={scaleKind}
          onChange={onScaleKind}
          options={[
            { value: "major", label: "Major" },
            { value: "natural_minor", label: "Minor" },
          ]}
          className="w-full"
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
          className="w-full"
          size="compact"
        />
      </div>

      <div
        ref={listRef}
        className="musai-key-board mt-4"
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
              onSelect={() => onTonicPc(natural.pitchClass)}
            />
          </div>
        ) : null}

        <div className="musai-key-col-head musai-key-col-head--flat">
          <span aria-hidden>♭</span>
          <span>Flats</span>
        </div>
        <div className="musai-key-count-head" aria-hidden>
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
                onSelect={() => onTonicPc(flat.pitchClass)}
              />
            ) : (
              <span className="musai-key-empty" aria-hidden />
            )}
            <span className="musai-key-count" aria-hidden>
              {count}
            </span>
            {sharp ? (
              <KeyButton
                option={sharp}
                selected={tonicPc === sharp.pitchClass}
                family="sharp"
                scaleKind={scaleKind}
                onSelect={() => onTonicPc(sharp.pitchClass)}
              />
            ) : (
              <span className="musai-key-empty" aria-hidden />
            )}
          </div>
        ))}
      </div>

      <div className="relative mt-3 flex flex-col items-center">
        <button
          type="button"
          className={`musai-chip inline-flex w-full max-w-[9.5rem] items-center justify-center px-3 py-2 text-[13px] font-semibold ${
            rangeOpen ? "musai-chip--on" : "musai-chip--off"
          }`}
          aria-expanded={rangeOpen}
          onClick={() => setRangeOpen((v) => !v)}
        >
          Range
        </button>
        {rangeOpen ? (
          <div className="musai-key-range-popover absolute left-1/2 top-[calc(100%+0.4rem)] z-20 w-[11.5rem] -translate-x-1/2 space-y-3 p-3 text-center">
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--musai-muted)]">
                Start
              </span>
              <div className="relative">
                <select
                  value={rootMidi}
                  onChange={(e) => onRootMidi(Number(e.target.value))}
                  className="musai-field-select pr-9 text-center"
                >
                  {violinRootsForTonic(tonicPc).map((m) => (
                    <option key={m} value={m}>
                      {describeRootChoice(m)}
                    </option>
                  ))}
                </select>
                <span
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--musai-muted)]"
                  aria-hidden
                >
                  <svg
                    viewBox="0 0 20 20"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 7l5 5 5-5"
                    />
                  </svg>
                </span>
              </div>
            </label>
            <button
              type="button"
              onClick={() => {
                onResetRange();
                setRangeOpen(false);
              }}
              className="w-full rounded-[var(--musai-radius)] border border-[var(--musai-border)] py-2 text-xs font-medium text-[var(--musai-muted)] transition-colors duration-200 hover:bg-[var(--musai-surface-2)] hover:text-[var(--musai-ink)]"
            >
              Reset
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
