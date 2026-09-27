/** Container-only recordings (no audio frames) land under this size. */
export const SCALE_TAKE_MIN_BYTES = 256;

export type ScaleTakeStatus = {
  headline: string;
  hint: string;
};

export const SCALE_TAKE_QUIET: ScaleTakeStatus = {
  headline: "Mic was quiet",
  hint: "Move closer",
};

export const SCALE_TAKE_NO_PITCH: ScaleTakeStatus = {
  headline: "Didn’t catch a pitch",
  hint: "Play a little louder",
};

export const SCALE_TAKE_NO_SCALE: ScaleTakeStatus = {
  headline: "Couldn’t hear a full scale",
  hint: "Play each note slowly",
};

export const SCALE_TAKE_FAILED: ScaleTakeStatus = {
  headline: "Recording failed",
  hint: "Try again",
};

export const SCALE_TAKE_UNREADABLE: ScaleTakeStatus = {
  headline: "Couldn’t read that",
  hint: "Try again",
};

/** One line for the recorder alert. No trailing full stop. */
export function scaleTakeStatusText(status: ScaleTakeStatus): string {
  const line = status.hint ? `${status.headline}. ${status.hint}` : status.headline;
  return line.replace(/\.+$/u, "");
}

export function readScaleTakeStatus(
  message: string | null | undefined,
): ScaleTakeStatus | null {
  if (!message) return null;
  const splitAt = message.indexOf(". ");
  if (splitAt <= 0) return null;
  const headline = message.slice(0, splitAt).trim();
  const hint = message.slice(splitAt + 2).trim();
  if (!headline || !hint || hint.includes("\n")) return null;
  return { headline, hint };
}

/** A missing or tiny blob never reached the analyser. */
export function messageForQuietTake(
  byteLength: number,
): ScaleTakeStatus | null {
  if (!Number.isFinite(byteLength) || byteLength < SCALE_TAKE_MIN_BYTES) {
    return SCALE_TAKE_QUIET;
  }
  return null;
}

/**
 * The file decoded, but this take still has nothing to show.
 * `heardPitch` is false when the detector found no tone at all.
 */
export function messageForUnheardScaleTake(input: {
  notesAnalyzed: number;
  heardPitch: boolean;
}): ScaleTakeStatus | null {
  if (input.notesAnalyzed > 0) return null;
  return input.heardPitch ? SCALE_TAKE_NO_SCALE : SCALE_TAKE_NO_PITCH;
}
