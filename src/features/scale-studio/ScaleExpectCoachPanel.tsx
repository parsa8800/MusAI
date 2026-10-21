import { DraftTipsFrame } from "@/components/ScaleStudioHomeDraft";

/**
 * Empty coach column — clear chat empty state before the first take.
 */
export function ScaleExpectCoachPanel({
  title = "Tips",
}: {
  title?: string;
  eyebrow?: string;
  body?: string;
}) {
  return (
    <section className="musai-studio-pane" aria-label={title}>
      {/* Match left mode-toggle chrome so titles/cards share a baseline */}
      <div className="musai-studio-pane__chrome" aria-hidden />

      <div className="musai-studio-pane__stage min-h-0 overflow-hidden">
        <DraftTipsFrame title={title} className="min-h-0 flex-1" />
      </div>
    </section>
  );
}
