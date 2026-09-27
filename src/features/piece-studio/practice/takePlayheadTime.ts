import { bufferToMono } from "@/lib/analyzePitch";
import { createAudioContext } from "@/lib/audioContext";
import {
  activePiecePitchWindow,
  matchPiecePitch,
} from "@/features/piece-studio/pitch/piecePitchMatch";
import { expectedNotesFromScore } from "@/features/piece-studio/score/expectedNotes";
import type { MusaiScoreV1 } from "@/features/piece-studio/score/musaiScore";

/** When a written note was heard in the take, and where it sits on the score. */
export type ScoreTimeAnchor = {
  audioSec: number;
  scoreSec: number;
};

export function takePlayheadAnchors(
  pitchNotes: readonly { noteIndex: number; heardSec?: number | null }[],
  notes: readonly { noteIndex: number; absoluteOnsetQuarters: number }[],
  absoluteQuartersToSec: (absoluteQuarters: number) => number,
): ScoreTimeAnchor[] {
  const byIndex = new Map(notes.map((note) => [note.noteIndex, note]));
  const anchors: ScoreTimeAnchor[] = [];
  for (const pitch of pitchNotes) {
    if (typeof pitch.heardSec !== "number" || !(pitch.heardSec >= 0)) continue;
    const note = byIndex.get(pitch.noteIndex);
    if (!note) continue;
    const scoreSec = absoluteQuartersToSec(note.absoluteOnsetQuarters);
    if (!Number.isFinite(scoreSec) || scoreSec < 0) continue;
    anchors.push({ audioSec: pitch.heardSec, scoreSec });
  }
  return anchors;
}

function monotoneAnchors(anchors: readonly ScoreTimeAnchor[]): ScoreTimeAnchor[] {
  const sorted = [...anchors]
    .filter(
      (anchor) =>
        Number.isFinite(anchor.audioSec) &&
        Number.isFinite(anchor.scoreSec) &&
        anchor.audioSec >= 0 &&
        anchor.scoreSec >= 0,
    )
    .sort((a, b) => a.audioSec - b.audioSec || a.scoreSec - b.scoreSec);
  const out: ScoreTimeAnchor[] = [];
  for (const anchor of sorted) {
    const prev = out[out.length - 1];
    if (prev && anchor.audioSec <= prev.audioSec + 1e-3) continue;
    if (prev && anchor.scoreSec < prev.scoreSec - 1e-3) continue;
    out.push(anchor);
  }
  return out;
}

/**
 * Turn the take's audio clock into score time so the playhead sits on the
 * note that is sounding, even when the take is slower or faster than the
 * written tempo.
 */
export function recordingTimeToScoreTime(
  audioSec: number,
  audioDurationSec: number,
  scoreDurationSec: number,
  anchors: readonly ScoreTimeAnchor[],
): number {
  const audio = Number.isFinite(audioSec) ? Math.max(0, audioSec) : 0;
  const audioDur =
    Number.isFinite(audioDurationSec) && audioDurationSec > 0
      ? audioDurationSec
      : 0;
  const scoreDur =
    Number.isFinite(scoreDurationSec) && scoreDurationSec > 0
      ? scoreDurationSec
      : 0;
  const points = monotoneAnchors(anchors);

  if (points.length === 0) {
    if (audioDur <= 0 || scoreDur <= 0) return audio;
    return Math.min(scoreDur, (audio / audioDur) * scoreDur);
  }

  const first = points[0]!;
  if (audio < first.audioSec) {
    if (first.audioSec <= 1e-4) return first.scoreSec;
    return (audio / first.audioSec) * first.scoreSec;
  }

  let index = 0;
  while (
    index + 1 < points.length &&
    points[index + 1]!.audioSec <= audio + 1e-4
  ) {
    index += 1;
  }
  const here = points[index]!;
  const next = points[index + 1];
  if (!next) return here.scoreSec;
  const span = next.audioSec - here.audioSec;
  const u = span > 1e-4 ? (audio - here.audioSec) / span : 0;
  return here.scoreSec + Math.min(1, Math.max(0, u)) * (next.scoreSec - here.scoreSec);
}

/**
 * Heard time of each expected note, for a take saved before those times
 * were stored on the feedback report.
 */
export async function heardSecondsForRecording(input: {
  score: MusaiScoreV1 | null;
  blob: Blob;
}): Promise<Array<number | null> | null> {
  const expected = expectedNotesFromScore(input.score);
  if (expected.length === 0 || input.blob.size < 1) return null;
  const ctx = createAudioContext();
  if (!ctx) return null;
  try {
    const raw = await input.blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(raw.slice(0));
    const mono = bufferToMono(audioBuffer);
    const match = matchPiecePitch({
      mono,
      sampleRateHz: audioBuffer.sampleRate,
      expectedMidis: expected.map((note) => note.midi),
      ...activePiecePitchWindow(),
    });
    return match.timesSec;
  } catch {
    return null;
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
