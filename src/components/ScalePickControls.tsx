"use client";

import { useMemo } from "react";
import { MusaiSegmentedControl } from "@/components/MusaiSegmentedControl";
import type { ScaleKind } from "@/lib/scales";
import {
  accidentalMarks,
  tonicAccidentalRows,
  type TonicAccidentalOption,
} from "@/lib/scales";

export type ScaleMotion = "ascending" | "up_down";

type Props = {
  tonicPc: number;
  onTonicPc: (pitchClass: number) => void;
  scaleKind: ScaleKind;
  onScaleKind: (kind: ScaleKind) => void;
  octaveSpan: 1 | 2;
  onOctaveSpan: (span: 1 | 2) => void;
  scaleMotion: ScaleMotion;
  onScaleMotion: (motion: ScaleMotion) => void;
};

function flattenKeys(kind: ScaleKind): TonicAccidentalOption[] {
  const out: TonicAccidentalOption[] = [];
  for (const row of tonicAccidentalRows(kind)) {
    out.push(...row.keys);
  }
  // Natural first, then flats by count, then sharps by count — easy to scan.
  return out.sort((a, b) => {
    const rank = (o: TonicAccidentalOption) => {
      if (o.accidentalKind === "natural" || o.accidentalCount === 0) return 0;
      if (o.accidentalKind === "flat") return o.accidentalCount;
      return 10 + o.accidentalCount;
    };
    return rank(a) - rank(b) || a.label.localeCompare(b.label);
  });
}

/**
 * Pick notes controls — key first, then type → span → direction.
 * Kept short so the staff stays readable.
 */
export function ScalePickControls({
  tonicPc,
  onTonicPc,
  scaleKind,
  onScaleKind,
  octaveSpan,
  onOctaveSpan,
  scaleMotion,
  onScaleMotion,
}: Props) {
  const keys = useMemo(() => flattenKeys(scaleKind), [scaleKind]);
  const selected = keys.find((k) => k.pitchClass === tonicPc) ?? keys[0]!;
  const markTone =
    selected.accidentalKind === "flat"
      ? "flat"
      : selected.accidentalKind === "sharp"
        ? "sharp"
        : "natural";

  return (
    <div className="musai-scale-pick">
      <label className="musai-key-select musai-key-select--hero">
        <span className="sr-only">Key</span>
        <span className="musai-key-select__face" aria-hidden>
          <span className="musai-key-select__letter">{selected.label}</span>
          <span className={`musai-key-select__marks musai-key-select__marks--${markTone}`}>
            {accidentalMarks(selected)}
          </span>
        </span>
        <select
          className="musai-key-select__native"
          value={tonicPc}
          onChange={(e) => onTonicPc(Number(e.target.value))}
          aria-label="Key"
        >
          {keys.map((key) => (
            <option key={`${key.pitchClass}-${key.label}`} value={key.pitchClass}>
              {key.label} {accidentalMarks(key)}
            </option>
          ))}
        </select>
      </label>

      <div className="musai-scale-pick__details">
        <MusaiSegmentedControl<ScaleKind>
          ariaLabel="Type"
          value={scaleKind}
          onChange={onScaleKind}
          options={[
            { value: "major", label: "Major" },
            { value: "natural_minor", label: "Minor" },
          ]}
          className="musai-scale-pick__control"
          size="compact"
        />
        <MusaiSegmentedControl<1 | 2>
          ariaLabel="Octaves"
          value={octaveSpan}
          onChange={onOctaveSpan}
          options={[
            { value: 1, label: "1 octave" },
            { value: 2, label: "2 octaves" },
          ]}
          className="musai-scale-pick__control"
          size="compact"
        />
        <MusaiSegmentedControl<ScaleMotion>
          ariaLabel="Direction"
          value={scaleMotion}
          onChange={onScaleMotion}
          options={[
            { value: "ascending", label: "Up" },
            { value: "up_down", label: "Up & down" },
          ]}
          className="musai-scale-pick__control"
          size="compact"
        />
      </div>
    </div>
  );
}
