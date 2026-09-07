"use client";

import { tapFeedback } from "@/lib/motion";

type Option<V extends string | number> = { value: V; label: string };

type MusaiSegmentedControlProps<V extends string | number> = {
  ariaLabel: string;
  value: V;
  onChange: (value: V) => void;
  options: Option<V>[];
  /** Additional classes on the track (e.g. max-width). */
  className?: string;
  size?: "default" | "compact";
};

/**
 * Shared liquid-glass segmented control (capture Record/Import, scale type, …).
 */
export function MusaiSegmentedControl<V extends string | number>({
  ariaLabel,
  value,
  onChange,
  options,
  className = "",
  size = "default",
}: MusaiSegmentedControlProps<V>) {
  const trackClass = [
    "musai-segmented",
    size === "compact" ? "musai-segmented--compact" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={trackClass} role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => {
              if (opt.value === value) return;
              tapFeedback("light");
              onChange(opt.value);
            }}
            className="musai-segmented__tab"
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
