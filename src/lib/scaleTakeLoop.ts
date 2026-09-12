/** Copy for the next scale recording in the practice loop. */
export function nextScaleTakeCopy(completedTakes: number): {
  takeNumber: number;
  label: string;
  hint: string;
  ariaLabel: string;
  again: boolean;
} {
  const takeNumber = Math.max(1, completedTakes + 1);
  const again = completedTakes > 0;
  return {
    takeNumber,
    label: `Take ${takeNumber}`,
    hint: again ? "Play it again" : "Play the scale",
    ariaLabel: again ? `Record take ${takeNumber}` : "Record take 1",
    again,
  };
}

/** Visible studio phase — recording and results share one layout. */
export type ScaleStudioPhase =
  | "ready"
  | "recording"
  | "analysing"
  | "results";

export function deriveScaleStudioPhase(args: {
  isRecording: boolean;
  analysing: boolean;
  hasSession: boolean;
}): ScaleStudioPhase {
  if (args.isRecording) return "recording";
  if (args.analysing) return "analysing";
  if (args.hasSession) return "results";
  return "ready";
}
