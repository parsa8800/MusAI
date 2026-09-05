"use client";

import {
  InfoPopover,
  InfoPopoverScanLines,
} from "@/components/InfoPopover";

const RECORDING_TIPS = [
  "Play one steady note",
  "Stay consistent",
  "Tap to stop",
];

export function IntonationRecordingHelpButton() {
  return (
    <InfoPopover
      title="Recording"
      titleAccent="sky"
      ariaLabel="Recording tips"
    >
      <InfoPopoverScanLines lines={RECORDING_TIPS} />
    </InfoPopover>
  );
}
