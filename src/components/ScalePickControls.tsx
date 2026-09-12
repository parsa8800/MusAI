"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { KeySignatureMini } from "@/components/KeySignatureMini";
import { MusaiSegmentedControl } from "@/components/MusaiSegmentedControl";
import { tapFeedback } from "@/lib/motion";
import type { ScaleKind } from "@/lib/scales";
import {
  keySignatureSummary,
  tonicAccidentalRows,
  type KeySignatureSummary,
  type TonicAccidentalOption,
} from "@/lib/scales";

const OVERLAY_ROOT_ID = "musai-overlay-root";

/**
 * Escape body overflow/isolation so the menu is never clipped by the studio
 * shell. Lives on <html>, outside body.musai-app-body.
 */
function ensureOverlayRoot(): HTMLElement {
  const existing = document.getElementById(OVERLAY_ROOT_ID);
  if (existing) return existing;
  const root = document.createElement("div");
  root.id = OVERLAY_ROOT_ID;
  root.className = "musai-overlay-root";
  document.documentElement.appendChild(root);
  return root;
}

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

function partitionKeys(kind: ScaleKind): {
  natural: TonicAccidentalOption | null;
  flats: TonicAccidentalOption[];
  sharps: TonicAccidentalOption[];
} {
  let natural: TonicAccidentalOption | null = null;
  const flats: TonicAccidentalOption[] = [];
  const sharps: TonicAccidentalOption[] = [];

  for (const row of tonicAccidentalRows(kind)) {
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

  flats.sort((a, b) => a.accidentalCount - b.accidentalCount);
  sharps.sort((a, b) => a.accidentalCount - b.accidentalCount);
  return { natural, flats, sharps };
}

function ScaleKeyOption({
  option,
  selected,
  family,
  scaleKind,
  onSelect,
}: {
  option: TonicAccidentalOption;
  selected: boolean;
  family: "flat" | "sharp" | "natural";
  scaleKind: ScaleKind;
  onSelect: (pitchClass: number) => void;
}) {
  const summary = keySignatureSummary(option, scaleKind);
  const aria = [summary.displayName, summary.countLabel]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      role="option"
      className={`musai-key-option musai-key-option--${family}`}
      aria-selected={selected}
      aria-label={aria}
      onClick={() => {
        tapFeedback("light");
        onSelect(option.pitchClass);
      }}
    >
      <KeySignatureMini option={option} scaleKind={scaleKind} size="row" />
      <span className="musai-key-option__copy">
        <span className="musai-key-option__name">{summary.displayName}</span>
        <span className="musai-key-option__count">{summary.countLabel}</span>
      </span>
    </button>
  );
}

function KeyGroup({
  title,
  family,
  keys,
  tonicPc,
  scaleKind,
  onSelect,
}: {
  title: string;
  family: "flat" | "sharp" | "natural";
  keys: TonicAccidentalOption[];
  tonicPc: number;
  scaleKind: ScaleKind;
  onSelect: (pitchClass: number) => void;
}) {
  if (keys.length === 0) return null;
  return (
    <div className="musai-key-menu__group">
      {title ? (
        <p className={`musai-key-menu__head musai-key-menu__head--${family}`}>
          {title}
        </p>
      ) : null}
      {keys.map((key) => (
        <ScaleKeyOption
          key={`${family}-${key.pitchClass}`}
          option={key}
          selected={tonicPc === key.pitchClass}
          family={family}
          scaleKind={scaleKind}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
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
  const { natural, flats, sharps } = useMemo(
    () => partitionKeys(scaleKind),
    [scaleKind],
  );
  const allKeys = [natural, ...flats, ...sharps].filter(
    (key): key is TonicAccidentalOption => key != null,
  );
  const selected =
    allKeys.find((key) => key.pitchClass === tonicPc) ?? allKeys[0]!;
  const selectedSummary: KeySignatureSummary = keySignatureSummary(
    selected,
    scaleKind,
  );
  const markTone =
    selected.accidentalKind === "flat"
      ? "flat"
      : selected.accidentalKind === "sharp"
        ? "sharp"
        : "natural";

  const [open, setOpen] = useState(false);
  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : ensureOverlayRoot(),
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    setOverlayRoot(ensureOverlayRoot());
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const place = () => {
      const rect = trigger.getBoundingClientRect();
      const vv = window.visualViewport;
      const vw = vv?.width ?? window.innerWidth;
      const vh = vv?.height ?? window.innerHeight;
      const originX = vv?.offsetLeft ?? 0;
      const originY = vv?.offsetTop ?? 0;
      const margin = 10;
      const gap = 6;
      const width = Math.min(
        Math.max(rect.width, Math.min(22 * 16, vw - margin * 2)),
        vw - margin * 2,
      );
      const left = Math.min(
        Math.max(originX + margin, rect.left),
        originX + vw - width - margin,
      );
      const spaceBelow = originY + vh - rect.bottom - margin - gap;
      const spaceAbove = rect.top - originY - margin - gap;
      const openDown =
        spaceBelow >= 140 || spaceBelow >= spaceAbove;
      const room = Math.max(48, openDown ? spaceBelow : spaceAbove);
      const maxHeight = room;
      const scroll = scrollRef.current;
      const contentH = scroll?.scrollHeight ?? 0;
      const chrome = Math.max(0, panel.offsetHeight - panel.clientHeight);
      const needed = contentH > 0 ? contentH + chrome : maxHeight;
      const height = Math.min(maxHeight, needed);
      const top = openDown
        ? rect.bottom + gap
        : Math.max(originY + margin, rect.top - gap - height);
      const next = [
        openDown ? "below" : "above",
        Math.round(width),
        Math.round(left),
        Math.round(top),
        Math.round(height),
        Math.round(maxHeight),
      ].join(",");
      if (panel.dataset.box === next) return;
      panel.dataset.box = next;
      panel.dataset.placement = openDown ? "below" : "above";
      panel.style.width = `${Math.round(width)}px`;
      panel.style.left = `${Math.round(left)}px`;
      panel.style.top = `${Math.round(top)}px`;
      panel.style.maxHeight = `${Math.round(maxHeight)}px`;
      panel.style.height = `${Math.round(height)}px`;
    };

    place();
    const selectedOption = scrollRef.current?.querySelector<HTMLElement>(
      '[aria-selected="true"]',
    );
    selectedOption?.scrollIntoView?.({ block: "nearest" });

    const scroll = scrollRef.current;
    const ro =
      typeof ResizeObserver === "undefined" || !scroll
        ? null
        : new ResizeObserver(place);
    ro?.observe(scroll);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (pitchClass: number) => {
    onTonicPc(pitchClass);
    setOpen(false);
  };

  const menu = open ? (
    <div
      ref={panelRef}
      className="musai-key-menu"
      role="listbox"
      aria-label="Key"
    >
      <div ref={scrollRef} className="musai-key-menu__scroll">
        {natural ? (
          <KeyGroup
            title="No accidentals"
            family="natural"
            keys={[natural]}
            tonicPc={tonicPc}
            scaleKind={scaleKind}
            onSelect={pick}
          />
        ) : null}
        <KeyGroup
          title="Flats"
          family="flat"
          keys={flats}
          tonicPc={tonicPc}
          scaleKind={scaleKind}
          onSelect={pick}
        />
        <KeyGroup
          title="Sharps"
          family="sharp"
          keys={sharps}
          tonicPc={tonicPc}
          scaleKind={scaleKind}
          onSelect={pick}
        />
      </div>
    </div>
  ) : null;

  return (
    <div className="musai-scale-pick">
      <button
        ref={triggerRef}
        type="button"
        className="musai-key-select"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Key, ${selectedSummary.displayName}, ${selectedSummary.countLabel}`}
        onClick={() => setOpen((value) => !value)}
      >
        <KeySignatureMini
          option={selected}
          scaleKind={scaleKind}
          size="sm"
        />
        <span className="musai-key-select__copy">
          <span className="musai-key-select__letter">
            {selectedSummary.displayName}
          </span>
          <span className={`musai-key-select__sig musai-key-select__sig--${markTone}`}>
            {selectedSummary.countLabel}
          </span>
        </span>
      </button>

      {overlayRoot && menu ? createPortal(menu, overlayRoot) : null}

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
        <div className="musai-scale-pick__row">
          <MusaiSegmentedControl<1 | 2>
            ariaLabel="Octaves"
            value={octaveSpan}
            onChange={onOctaveSpan}
            options={[
              { value: 1, label: "1 oct" },
              { value: 2, label: "2 oct" },
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
              { value: "up_down", label: "Up/down" },
            ]}
            className="musai-scale-pick__control"
            size="compact"
          />
        </div>
      </div>
    </div>
  );
}
