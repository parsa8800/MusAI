"use client";

import { useEffect, useState } from "react";
import {
  readScaleFingeringEnabled,
  subscribeScaleFingering,
  writeScaleFingeringEnabled,
} from "@/lib/scaleFingeringPreference";

export function useScaleFingeringEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(readScaleFingeringEnabled());
    return subscribeScaleFingering(() => {
      setEnabled(readScaleFingeringEnabled());
    });
  }, []);

  return enabled;
}

/** One switch for every scale. The choice is remembered on this device. */
export function ScaleFingeringToggle({ className = "" }: { className?: string }) {
  const enabled = useScaleFingeringEnabled();

  return (
    <button
      type="button"
      className={`musai-pressable musai-finger-toggle ${className}`.trim()}
      aria-pressed={enabled}
      aria-label={enabled ? "Hide fingering on scales" : "Show fingering on scales"}
      onClick={() => writeScaleFingeringEnabled(!enabled)}
    >
      Fingering
    </button>
  );
}
