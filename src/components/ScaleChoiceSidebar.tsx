"use client";

import { animate } from "animejs";
import { useEffect, useRef } from "react";
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

/** Colored word badge — no tiny ♯♯♯ rows. */
function AccidentalHint({
  option,
  selected,
}: {
  option: TonicAccidentalOption;
  selected: boolean;
}) {
  const kind =
    option.accidentalKind === "natural" || option.accidentalCount === 0
      ? "natural"
      : option.accidentalKind;

  const tone =
    kind === "flat"
      ? selected
        ? "bg-sky-400/25 text-sky-100 ring-1 ring-sky-300/40"
        : "bg-sky-500/12 text-sky-200/90 ring-1 ring-sky-400/18"
      : kind === "sharp"
        ? selected
          ? "bg-amber-400/25 text-amber-50 ring-1 ring-amber-200/45"
          : "bg-amber-500/12 text-amber-100/90 ring-1 ring-amber-400/22"
        : selected
          ? "bg-white/[0.12] text-zinc-100 ring-1 ring-white/18"
          : "bg-white/[0.04] text-zinc-500 ring-1 ring-white/10";

  return (
    <span
      className={`mt-1 inline-flex min-h-[1.45rem] max-w-full items-center justify-center rounded-md px-1.5 text-[11px] font-semibold leading-none tracking-wide ${tone}`}
    >
      {accidentalBadge(option)}
    </span>
  );
}

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
  const listRef = useRef<HTMLDivElement>(null);
  const prevPc = useRef(tonicPc);

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
    <aside className="musai-glass-inset w-full px-2.5 py-3.5 text-center sm:px-3 sm:py-4 lg:sticky lg:top-6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-400/90">
        Choose scale
      </p>
      <p className="mt-1 text-[11px] leading-snug text-zinc-500">
        Flats left · sharps right
      </p>

      <div className="mt-3 space-y-2">
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
        className="my-3 h-px w-full bg-gradient-to-r from-transparent via-white/12 to-transparent"
        aria-hidden
      />

      <div ref={listRef} className="space-y-1.5">
        {rows.map((row) => (
          <div
            key={row.accidentalCount}
            className={`grid gap-1.5 ${
              row.keys.length === 1 ? "grid-cols-1 px-4" : "grid-cols-2"
            }`}
          >
            {row.keys.map((t) => {
              const selected = tonicPc === t.pitchClass;
              return (
                <button
                  key={`${t.pitchClass}-${t.accidentalKind}`}
                  type="button"
                  onClick={() => onTonicPc(t.pitchClass)}
                  className={`musai-chip musai-studio-tonic inline-flex w-full flex-col items-center justify-center gap-0.5 px-1 py-2 ${
                    selected ? "musai-chip--on musai-studio-tonic--on" : "musai-chip--off"
                  }`}
                  aria-pressed={selected}
                  aria-label={`${t.label} ${scaleKind === "major" ? "major" : "minor"}, ${accidentalBadge(t)}`}
                >
                  <span className="text-[13px] font-semibold leading-none tracking-tight">
                    {t.label}
                  </span>
                  <AccidentalHint option={t} selected={selected} />
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <details className="group mt-4 flex flex-col items-center">
        <summary className="musai-chip musai-chip--off inline-flex w-full max-w-[9.5rem] cursor-pointer list-none items-center justify-center border border-white/12 px-3 py-2 text-[13px] font-semibold group-open:musai-chip--on [&::-webkit-details-marker]:hidden">
          Range
        </summary>
        <div className="mt-3 w-full space-y-3 text-center">
          <label className="block">
            <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
              Start pitch
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
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
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
            className="mx-auto block w-full max-w-[9.5rem] rounded-xl border border-white/[0.08] py-2 text-xs font-medium text-zinc-400 transition-colors duration-200 hover:bg-white/[0.04] hover:text-zinc-200"
          >
            Reset range
          </button>
        </div>
      </details>
    </aside>
  );
}
