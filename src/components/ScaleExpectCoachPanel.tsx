import { DraftTipsFrame } from "@/components/ScaleStudioHomeDraft";

/**
 * Empty coach column — mirrors the notes pane: title + draft frame on one baseline.
 */
export function ScaleExpectCoachPanel({
  title = "Tips",
  compact = false,
}: {
  title?: string;
  eyebrow?: string;
  body?: string;
  /** Slimmer tips placeholder when Pick notes needs more left room. */
  compact?: boolean;
}) {
  return (
    <section
      className="musai-studio-pane"
      aria-label={title}
    >
      {/* Match left mode-toggle chrome so titles/cards share a baseline */}
      <div className="musai-studio-pane__chrome" aria-hidden />

      <div className="musai-studio-pane__stage">
        <h2 className="musai-studio-pane__title">{title}</h2>
        <DraftTipsFrame
          className={compact ? "max-w-[15rem] sm:max-w-[16rem]" : undefined}
        />
      </div>
    </section>
  );
}
