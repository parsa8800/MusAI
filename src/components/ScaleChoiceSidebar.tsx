"use client";

import { animate } from "animejs";
import { useEffect, useMemo, useRef } from "react";
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
  flats: TonicAccidentalOption[];
  sharps: TonicAccidentalOption[];
} {
  let natural: TonicAccidentalOption | null = null;
  const flats: TonicAccidentalOption[] = [];
  const sharps: TonicAccidentalOption[] = [];

  for (const row of rows) {
    for (const key of row.keys) {
      if (key.accidentalKind === "natural" || key.accidentalCount === 0) {
        natural = key;
      } else if (key.accidentalKind === "flat") {
        flats.push(key);
      } else {
        sharps.push(key);
      }
    }
  }

  return { natural, flats, sharps };
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
 * Scale / key picker — flats left (cool), sharps right (warm), natural centered.
 * Colour + grouping carry the scan; no “1 sharp” microcopy under every key.
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
  const { natural, flats, sharps } = useMemo(() => partitionKeys(rows), [rows]);
  const listRef = useRef<HTMLDivElement>(null);
  const prevPc = useRef(tonicPc);
  const pairCount = Math.max(flats.length, sharps.length);

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
    <aside className="w-full px-1 py-1 text-center sm:px-1.5">
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

        <div className="musai-key-col-head musai-key-col-head--flat" aria-hidden>
          <span>♭</span>
        </div>
        <div className="musai-key-col-head musai-key-col-head--sharp" aria-hidden>
          <span>♯</span>
        </div>

        {Array.from({ length: pairCount }, (_, i) => {
          const flat = flats[i];
          const sharp = sharps[i];
          return (
            <div key={`pair-${i}`} className="contents">
              {flat ? (
                <KeyButton
                  option={flat}
                  selected={tonicPc === flat.pitchClass}
                  family="flat"
                  scaleKind={scaleKind}
                  onSelect={() => onTonicPc(flat.pitchClass)}
                />
              ) : (
                <span aria-hidden />
              )}
              {sharp ? (
                <KeyButton
                  option={sharp}
                  selected={tonicPc === sharp.pitchClass}
                  family="sharp"
                  scaleKind={scaleKind}
                  onSelect={() => onTonicPc(sharp.pitchClass)}
                />
              ) : (
                <span aria-hidden />
              )}
            </div>
          );
        })}
      </div>

      <details className="group mt-4 flex flex-col items-center">
        <summary className="musai-chip musai-chip--off inline-flex w-full max-w-[9.5rem] cursor-pointer list-none items-center justify-center px-3 py-2 text-[13px] font-semibold group-open:musai-chip--on [&::-webkit-details-marker]:hidden">
          Range
        </summary>
        <div className="mt-3 w-full space-y-3 text-center">
          <label className="block">
            <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--musai-muted)]">
              Start
            </span>
            <div className="relative mx-auto max-w-[9.5rem]">
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
            onClick={onResetRange}
            className="mx-auto block w-full max-w-[9.5rem] rounded-[var(--musai-radius)] border border-[var(--musai-border)] py-2 text-xs font-medium text-[var(--musai-muted)] transition-colors duration-200 hover:bg-[var(--musai-surface-2)] hover:text-[var(--musai-ink)]"
          >
            Reset
          </button>
        </div>
      </details>
    </aside>
  );
}
