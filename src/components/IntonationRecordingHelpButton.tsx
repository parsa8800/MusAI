"use client";

import {
  InfoPopover,
  InfoPopoverScanLines,
} from "@/components/InfoPopover";

const RECORDING_TIPS = [
  "One steady note",
  "Stop when finished",
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
