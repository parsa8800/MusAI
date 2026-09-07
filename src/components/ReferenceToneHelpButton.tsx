"use client";

import {
  InfoPopover,
  InfoPopoverScanLines,
} from "@/components/InfoPopover";

const TARGET_TIPS = [
  "Hold to hear reference tone",
  "Drag to change octave",
];

export function ReferenceToneHelpButton() {
  return (
    <InfoPopover
      title="Target"
      titleAccent="emerald"
      ariaLabel="Note wheel tips"
    >
      <InfoPopoverScanLines lines={TARGET_TIPS} />
    </InfoPopover>
  );
}
