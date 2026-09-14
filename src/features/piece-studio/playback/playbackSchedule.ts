import type { PlaybackNote } from "@/features/piece-studio/playback/playbackTimeline";

export type ScheduledNoteAttack = {
  /** Index into the timeline note list (used for de-dupe). */
  index: number;
  midi: number;
  /** AudioContext time for attack. */
  when: number;
  /** Hold length in audio seconds (smplr `duration`). */
  durationSec: number;
};

export type PlanScheduledNotesArgs = {
  notes: readonly PlaybackNote[];
  /** Score-time cursor when this schedule window opens. */
  fromSec: number;
  /** Score-time horizon (exclusive-ish upper bound for note starts). */
  untilSec: number;
  /** Playback rate vs base tempo (bpm / baseBpm). */
  rate: number;
  /** AudioContext.currentTime at schedule call. */
  audioNow: number;
  /** Notes already armed this transport segment. */
  started: ReadonlySet<number>;
  /** Optional loop end in score seconds — notes at/after this are skipped. */
  loopEndSec?: number | null;
};

/**
 * Pure lookahead planner for Listen. Seek/play must schedule every remaining
 * note in the window — never a single selected event.
 *
 * Durations are absolute audio seconds so instruments can use smplr `duration`
 * instead of calling StopFn (which cancels queued future notes).
 */
export function planScheduledNotes(
  args: PlanScheduledNotesArgs,
): ScheduledNoteAttack[] {
  const {
    notes,
    fromSec,
    untilSec,
    rate,
    audioNow,
    started,
    loopEndSec = null,
  } = args;
  const r = Math.max(1e-6, rate);
  const out: ScheduledNoteAttack[] = [];

  for (let index = 0; index < notes.length; index++) {
    const note = notes[index]!;
    if (note.startSec > untilSec) break;
    if (started.has(index)) continue;
    if (note.endSec <= fromSec + 0.01) continue;
    if (loopEndSec != null && note.startSec >= loopEndSec - 0.001) continue;

    const start = Math.max(note.startSec, fromSec);
    const when =
      note.startSec >= fromSec - 0.0005
        ? audioNow + (start - fromSec) / r
        : audioNow;
    const endAudio = audioNow + (note.endSec - fromSec) / r;
    const durationSec = Math.max(0.05, endAudio - when);
    out.push({ index, midi: note.midi, when, durationSec });
  }

  return out;
}
