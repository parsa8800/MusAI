import type { MusaiScoreV1, ScoreDynamic } from "@/features/piece-studio/score/musaiScore";

export const DEFAULT_PLAYBACK_BPM = 100;

const DYNAMIC_VELOCITY: Record<string, number> = {
  ppp: 0.22,
  pp: 0.32,
  p: 0.42,
  mp: 0.55,
  mf: 0.68,
  f: 0.82,
  ff: 0.92,
  fff: 1,
  fp: 0.8,
  sf: 0.9,
  sfz: 0.92,
};

export type PlaybackNote = {
  startSec: number;
  endSec: number;
  startQuarter: number;
  midi: number;
  velocity: number;
};

export type TempoSpan = {
  fromQuarter: number;
  bpm: number;
};

export type PlaybackMeasure = {
  /** 1-based bar number for student-facing UI. */
  number: number;
  startQuarter: number;
  endQuarter: number;
  startSec: number;
  endSec: number;
  beats: number;
  beatType: number;
};

export type PlaybackBeat = {
  tSec: number;
  measureNumber: number;
  /** 0-based beat within the measure. */
  beatIndex: number;
};

export type PlaybackTimeline = {
  notes: PlaybackNote[];
  measures: PlaybackMeasure[];
  beats: PlaybackBeat[];
  durationQuarters: number;
  durationSec: number;
  baseBpm: number;
  tempoSpans: TempoSpan[];
};

function velocityFor(mark: string): number {
  return DYNAMIC_VELOCITY[mark.toLowerCase()] ?? 0.68;
}

function measureLengthQuarters(
  beats: number,
  beatType: number,
  maxEventEnd: number,
): number {
  const fromTime = beats * (4 / beatType);
  return Math.max(fromTime, maxEventEnd, 0);
}

/**
 * Flatten a MusAI score into a timed note list and tempo map.
 * Seconds assume MusicXML tempo is quarter-notes per minute.
 */
export function buildPlaybackTimeline(score: MusaiScoreV1): PlaybackTimeline {
  const firstPart = score.parts[0];
  let beats = 4;
  let beatType = 4;
  let bpm = score.tempoBpm && score.tempoBpm > 0 ? score.tempoBpm : DEFAULT_PLAYBACK_BPM;
  const baseBpm = bpm;
  const tempoSpans: TempoSpan[] = [{ fromQuarter: 0, bpm }];
  const measureStarts: number[] = [];
  let quarter = 0;

  if (firstPart) {
    for (const measure of firstPart.measures) {
      if (measure.time) {
        beats = measure.time.beats;
        beatType = measure.time.beatType;
      }
      if (measure.tempoBpm && measure.tempoBpm > 0 && measure.tempoBpm !== bpm) {
        bpm = measure.tempoBpm;
        tempoSpans.push({ fromQuarter: quarter, bpm });
      }
      let maxEnd = 0;
      for (const event of measure.events) {
        if (event.kind === "note" || event.kind === "rest") {
          maxEnd = Math.max(maxEnd, event.onsetQuarters + event.durationQuarters);
        }
      }
      measureStarts.push(quarter);
      quarter += measureLengthQuarters(beats, beatType, maxEnd);
    }
  }

  const durationQuarters = quarter;
  const measures: PlaybackMeasure[] = [];
  for (let i = 0; i < measureStarts.length; i++) {
    const startQ = measureStarts[i]!;
    const endQ = i + 1 < measureStarts.length ? measureStarts[i + 1]! : durationQuarters;
    let mBeats = 4;
    let mBeatType = 4;
    const src = firstPart?.measures[i];
    if (src?.time) {
      mBeats = src.time.beats;
      mBeatType = src.time.beatType;
    } else {
      // Carry time signature forward when a measure omits an explicit change.
      for (let j = i; j >= 0; j--) {
        const earlier = firstPart?.measures[j]?.time;
        if (earlier) {
          mBeats = earlier.beats;
          mBeatType = earlier.beatType;
          break;
        }
      }
    }
    measures.push({
      number: i + 1,
      startQuarter: startQ,
      endQuarter: endQ,
      startSec: secondsAtQuarter(tempoSpans, startQ),
      endSec: secondsAtQuarter(tempoSpans, endQ),
      beats: mBeats,
      beatType: mBeatType,
    });
  }

  const beatGrid: PlaybackBeat[] = [];
  for (const measure of measures) {
    const beatLenQuarters = 4 / measure.beatType;
    for (let b = 0; b < measure.beats; b++) {
      const q = measure.startQuarter + b * beatLenQuarters;
      if (q >= measure.endQuarter - 1e-6) break;
      beatGrid.push({
        tSec: secondsAtQuarter(tempoSpans, q),
        measureNumber: measure.number,
        beatIndex: b,
      });
    }
  }

  const notes: PlaybackNote[] = [];

  for (const part of score.parts) {
    let vel = 0.68;
    let partQuarter = 0;
    let partBeats = 4;
    let partBeatType = 4;
    for (let i = 0; i < part.measures.length; i++) {
      const measure = part.measures[i]!;
      if (measure.time) {
        partBeats = measure.time.beats;
        partBeatType = measure.time.beatType;
      }
      const start =
        i < measureStarts.length ? measureStarts[i]! : partQuarter;
      for (const event of measure.events) {
        if (event.kind === "dynamic") {
          vel = velocityFor((event as ScoreDynamic).mark);
        } else if (event.kind === "note" && event.durationQuarters > 0) {
          const startQ = start + event.onsetQuarters;
          const endQ = startQ + event.durationQuarters;
          notes.push({
            startQuarter: startQ,
            startSec: secondsAtQuarter(tempoSpans, startQ),
            endSec: secondsAtQuarter(tempoSpans, endQ),
            midi: event.pitch.midi,
            velocity: vel,
          });
        }
      }
      let maxEnd = 0;
      for (const event of measure.events) {
        if (event.kind === "note" || event.kind === "rest") {
          maxEnd = Math.max(maxEnd, event.onsetQuarters + event.durationQuarters);
        }
      }
      partQuarter = start + measureLengthQuarters(partBeats, partBeatType, maxEnd);
    }
  }

  notes.sort((a, b) => a.startSec - b.startSec || a.midi - b.midi);

  return {
    notes,
    measures,
    beats: beatGrid,
    durationQuarters,
    durationSec: secondsAtQuarter(tempoSpans, durationQuarters),
    baseBpm,
    tempoSpans,
  };
}

/** Snap a score time to the start of the measure that contains it. */
export function snapToMeasureStart(
  measures: PlaybackMeasure[],
  tSec: number,
): number {
  if (measures.length === 0) return Math.max(0, tSec);
  for (let i = measures.length - 1; i >= 0; i--) {
    const m = measures[i]!;
    if (tSec >= m.startSec - 1e-4) return m.startSec;
  }
  return measures[0]!.startSec;
}

export function measureAtSeconds(
  measures: PlaybackMeasure[],
  tSec: number,
): PlaybackMeasure | null {
  if (measures.length === 0) return null;
  for (let i = measures.length - 1; i >= 0; i--) {
    const m = measures[i]!;
    if (tSec >= m.startSec - 1e-4) return m;
  }
  return measures[0]!;
}

export function measureByNumber(
  measures: PlaybackMeasure[],
  number: number,
): PlaybackMeasure | null {
  return measures.find((m) => m.number === number) ?? null;
}

export function loopBoundsSec(
  measures: PlaybackMeasure[],
  fromNumber: number,
  toNumber: number,
): { startSec: number; endSec: number } | null {
  const a = Math.min(fromNumber, toNumber);
  const b = Math.max(fromNumber, toNumber);
  const start = measureByNumber(measures, a);
  const end = measureByNumber(measures, b);
  if (!start || !end) return null;
  return { startSec: start.startSec, endSec: end.endSec };
}

export function secondsAtQuarter(spans: TempoSpan[], quarter: number): number {
  if (quarter <= 0 || spans.length === 0) return 0;
  let sec = 0;
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i]!;
    const next = spans[i + 1]?.fromQuarter ?? quarter;
    const end = Math.min(quarter, next);
    if (end > span.fromQuarter) {
      sec += ((end - span.fromQuarter) * 60) / span.bpm;
    }
    if (next >= quarter) break;
  }
  return sec;
}

export function quarterAtSeconds(spans: TempoSpan[], seconds: number): number {
  if (seconds <= 0 || spans.length === 0) return 0;
  let remaining = seconds;
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i]!;
    const nextQ = spans[i + 1]?.fromQuarter;
    const spanQuarters =
      nextQ == null ? Number.POSITIVE_INFINITY : nextQ - span.fromQuarter;
    const spanSec = (spanQuarters * 60) / span.bpm;
    if (remaining <= spanSec || nextQ == null) {
      return span.fromQuarter + (remaining * span.bpm) / 60;
    }
    remaining -= spanSec;
  }
  return spans[spans.length - 1]!.fromQuarter;
}

export function wholeNotesToSeconds(
  timeline: PlaybackTimeline,
  wholeNotes: number,
): number {
  return secondsAtQuarter(timeline.tempoSpans, wholeNotes * 4);
}

export function clampPlaybackTime(t: number, durationSec: number): number {
  if (!Number.isFinite(t) || durationSec <= 0) return 0;
  return Math.max(0, Math.min(durationSec, t));
}

export function formatPieceClock(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}
