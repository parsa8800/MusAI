"use client";

import { MusaiRecorderControls } from "@/components/MusaiMicCapturePanel";

export function MusaiFloatingMiniRecorder({
  mounted,
  visible,
  isRecording,
  onStartRecording,
  onStopRecording,
  elapsedLabel,
  levelBars,
}: {
  mounted: boolean;
  visible: boolean;
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  elapsedLabel: string;
  levelBars: number[];
}) {
  if (!mounted) return null;

  return (
    <div
      className={`fixed z-[420] transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        visible
          ? "opacity-100 translate-y-0 scale-100"
          : "pointer-events-none opacity-0 translate-y-4 scale-[0.96]"
      }`}
      style={{
        bottom: "max(1.25rem, env(safe-area-inset-bottom))",
        right: "max(1.25rem, env(safe-area-inset-right))",
      }}
      aria-hidden={!visible}
    >
      <div className="rounded-xl border border-[var(--musai-border)] bg-[var(--musai-surface)] p-2 shadow-[var(--musai-shadow)]">
        <MusaiRecorderControls
          size="mini"
          variant="dock"
          isRecording={isRecording}
          onStartRecording={onStartRecording}
          onStopRecording={onStopRecording}
          elapsedLabel={elapsedLabel}
          levelBars={levelBars}
          className="w-[92px]"
        />
      </div>
    </div>
  );
}

