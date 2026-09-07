"use client";

import { ScaleTrebleStaff } from "@/components/ScaleTrebleStaff";
import {
  buildAscendingScaleMidis,
  defaultRootMidiForTonic,
} from "@/lib/scales";

/** Static Just-play silhouette — always the same short ascending scale. */
const DRAFT_TONIC_PC = 0;
const DRAFT_KIND = "major" as const;
const DRAFT_SPAN = 1 as const;

const draftFrameClass =
  "w-full overflow-hidden rounded-[1.25rem] border-2 border-dotted border-[color-mix(in_srgb,var(--musai-muted)_30%,var(--musai-border))] bg-[color-mix(in_srgb,var(--musai-surface)_45%,transparent)]";

/**
 * Soft draft staff — silhouette only (no captions), so it reads as a template.
 * Stays fixed; does not follow the player's key / octave picks.
 */
export function DraftNotesFrame({ className = "" }: { className?: string }) {
  const rootMidi = defaultRootMidiForTonic(DRAFT_TONIC_PC);
  const ascending = buildAscendingScaleMidis(rootMidi, DRAFT_KIND, DRAFT_SPAN);

  return (
    <div
      className={`${draftFrameClass} max-w-[22rem] px-3 py-3 sm:max-w-[26rem] sm:px-4 ${className}`.trim()}
      aria-hidden
    >
      <div className="pointer-events-none select-none musai-draft-staff">
        <ScaleTrebleStaff
          ascendingMidis={ascending}
          descendingMidis={[]}
          tonicPitchClass={DRAFT_TONIC_PC}
          scaleKind={DRAFT_KIND}
          density="pad"
        />
      </div>
    </div>
  );
}

/** Matching tips silhouette — title lives outside so both panes share one rhythm. */
export function DraftTipsFrame({ className = "" }: { className?: string }) {
  return (
    <div
      className={`${draftFrameClass} flex min-h-[10rem] max-w-[22rem] flex-col justify-center gap-3 px-5 py-5 sm:max-w-[26rem] ${className}`.trim()}
      aria-hidden
    >
      <div className="w-full space-y-2.5">
        <div className="mx-auto h-2.5 w-16 rounded-full border border-dotted border-[color-mix(in_srgb,var(--musai-accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--musai-accent)_10%,transparent)]" />
        <div className="h-2 w-full rounded-full border border-dotted border-[color-mix(in_srgb,var(--musai-muted)_22%,transparent)]" />
        <div className="h-2 w-[86%] rounded-full border border-dotted border-[color-mix(in_srgb,var(--musai-muted)_22%,transparent)]" />
        <div className="h-2 w-[68%] rounded-full border border-dotted border-[color-mix(in_srgb,var(--musai-muted)_22%,transparent)]" />
      </div>
    </div>
  );
}
