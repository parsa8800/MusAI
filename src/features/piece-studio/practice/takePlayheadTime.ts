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
  pitchNotes: readonly {
    noteIndex: number;
    heardSec?: number | null;
    heardEndSec?: number | null;
  }[],
  notes: readonly { noteIndex: number; absoluteOnsetQuarters: number }[],
  absoluteQuartersToSec: (absoluteQuarters: number) => number,
  scoreMarks: readonly { absoluteOnsetQuarters: number }[] = [],
): ScoreTimeAnchor[] {
  const byIndex = new Map(notes.map((note) => [note.noteIndex, note]));
  const heard: ScoreTimeAnchor[] = [];
  for (const pitch of pitchNotes) {
    if (typeof pitch.heardSec !== "number" || !(pitch.heardSec >= 0)) continue;
    const note = byIndex.get(pitch.noteIndex);
    if (!note) continue;
    const scoreSec = absoluteQuartersToSec(note.absoluteOnsetQuarters);
    if (!Number.isFinite(scoreSec) || scoreSec < 0) continue;
    // One stop per attack. The bar travels the whole gap to the next note,
    // so a held sound does not freeze the pointer and then leap.
    heard.push({ audioSec: pitch.heardSec, scoreSec });
  }
  const marks = scoreMarks
    .map((mark) => absoluteQuartersToSec(mark.absoluteOnsetQuarters))
    .filter((scoreSec) => Number.isFinite(scoreSec) && scoreSec >= 0)
    .sort((a, b) => a - b);
  return densifyAnchorsAlongScore(heard, marks);
}

/**
 * Keep confirmed attacks, and walk the written score (notes and rests) between
 * them so the playhead does not jump a rest or a missed note.
 */
export function densifyAnchorsAlongScore(
  heard: readonly ScoreTimeAnchor[],
  scoreMarks: readonly number[],
): ScoreTimeAnchor[] {
  const points = monotoneAnchors(heard);
  if (points.length === 0 || scoreMarks.length === 0) return points;
  const extra: ScoreTimeAnchor[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const here = points[i]!;
    const next = points[i + 1]!;
    const scoreSpan = next.scoreSec - here.scoreSec;
    const audioSpan = next.audioSec - here.audioSec;
    if (scoreSpan <= 1e-3 || audioSpan <= 1e-3) continue;
    for (const mark of scoreMarks) {
      if (mark <= here.scoreSec + 1e-3 || mark >= next.scoreSec - 1e-3) continue;
      const u = (mark - here.scoreSec) / scoreSpan;
      extra.push({
        audioSec: here.audioSec + u * audioSpan,
        scoreSec: mark,
      });
    }
  }
  return monotoneAnchors([...points, ...extra]);
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
  if (!next) {
    // After the last note, keep walking the written ending (a final rest,
    // the remaining beats) until the piece and the recording both finish.
    if (scoreDur > here.scoreSec + 1e-3 && audioDur > here.audioSec + 1e-3) {
      const span = audioDur - here.audioSec;
      const u = Math.min(1, Math.max(0, (audio - here.audioSec) / span));
      return here.scoreSec + u * (scoreDur - here.scoreSec);
    }
    return here.scoreSec;
  }
  const span = next.audioSec - here.audioSec;
  const u = span > 1e-4 ? (audio - here.audioSec) / span : 0;
  return here.scoreSec + Math.min(1, Math.max(0, u)) * (next.scoreSec - here.scoreSec);
}

/**
 * Turn a playhead position on the written score back into the take's audio
 * time, so dragging the bar seeks the recording to the note under it.
 */
export function scoreTimeToRecordingTime(
  scoreSec: number,
  audioDurationSec: number,
  scoreDurationSec: number,
  anchors: readonly ScoreTimeAnchor[],
): number {
  const score = Number.isFinite(scoreSec) ? Math.max(0, scoreSec) : 0;
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
    if (audioDur <= 0 || scoreDur <= 0) return score;
    return Math.min(audioDur, (score / scoreDur) * audioDur);
  }

  const first = points[0]!;
  if (score <= first.scoreSec + 1e-4) {
    if (first.scoreSec <= 1e-4) return first.audioSec;
    return Math.min(1, score / first.scoreSec) * first.audioSec;
  }

  let index = 0;
  while (
    index + 1 < points.length &&
    points[index + 1]!.scoreSec < score - 1e-4
  ) {
    index += 1;
  }
  const here = points[index]!;
  const next = points[index + 1];
  if (next && next.scoreSec > here.scoreSec + 1e-4) {
    const span = next.scoreSec - here.scoreSec;
    const u = Math.min(1, Math.max(0, (score - here.scoreSec) / span));
    return here.audioSec + u * (next.audioSec - here.audioSec);
  }

  if (scoreDur > here.scoreSec + 1e-3 && audioDur > here.audioSec + 1e-3) {
    const span = scoreDur - here.scoreSec;
    const u = Math.min(1, Math.max(0, (score - here.scoreSec) / span));
    return here.audioSec + u * (audioDur - here.audioSec);
  }
  return here.audioSec;
}

/**
 * Heard time of each expected note, for a take saved before those times
 * were stored on the feedback report.
 */
export type HeardTakeTimes = {
  heardSec: Array<number | null>;
  heardEndSec: Array<number | null>;
};

export async function heardSecondsForRecording(input: {
  score: MusaiScoreV1 | null;
  blob: Blob;
}): Promise<HeardTakeTimes | null> {
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
      durationQuarters: expected.map((note) => note.durationQuarters),
      onsetQuarters: expected.map((note) => note.absoluteOnsetQuarters),
      ...activePiecePitchWindow(),
    });
    return {
      heardSec: match.attackSec.map(
        (time, i) => time ?? match.timesSec[i] ?? null,
      ),
      heardEndSec: (match.endSec ?? []).map((time) =>
        typeof time === "number" ? time : null,
      ),
    };
  } catch {
    return null;
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
