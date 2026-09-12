import { PitchDetector } from "pitchy";

const FRAME = 4096;
const HOP = 2048;
const MIN_HZ = 80;
const MAX_HZ = 5000;
/** Violin scale takes rarely need above ~D6; capping cuts false harmonic highs. */
const SCALE_MAX_HZ = 1200;
/** Real violin takes often sit below the tuner’s 0.82 clarity floor. */
const SCALE_CLARITY = 0.72;
const SCALE_MIN_VOLUME_DB = -45;
const TUNER_CLARITY = 0.82;
const TUNER_MIN_VOLUME_DB = -38;

export type PitchEstimateResult = {
  medianHz: number;
  validFrames: number;
  totalFrames: number;
};

/** Single hop-aligned pitch sample for time-series / scale analysis. */
export type PitchFrame = {
  /** Centre time of the analysis frame (seconds). */
  timeSec: number;
  hz: number;
  clarity: number;
};

/** A4 = 440 Hz reference. */
export function hzToMidi(hz: number): number {
  return 69 + (12 * Math.log2(hz / 440));
}

/**
 * Mixes channels to mono and returns a new Float32Array.
 */
export function bufferToMono(audioBuffer: AudioBuffer): Float32Array {
  const { length, numberOfChannels } = audioBuffer;
  if (numberOfChannels === 1) {
    return Float32Array.from(audioBuffer.getChannelData(0));
  }
  const mono = new Float32Array(length);
  for (let c = 0; c < numberOfChannels; c++) {
    const ch = audioBuffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += ch[i];
  }
  const scale = 1 / numberOfChannels;
  for (let i = 0; i < length; i++) mono[i] *= scale;
  return mono;
}

/**
 * Sliding-window pitch track; returns median Hz of confident frames.
 */
export function estimatePitchMedianHz(
  mono: Float32Array,
  sampleRate: number,
): PitchEstimateResult {
  const detector = PitchDetector.forFloat32Array(FRAME);
  detector.clarityThreshold = TUNER_CLARITY;
  detector.minVolumeDecibels = TUNER_MIN_VOLUME_DB;

  const pitches: number[] = [];
  let totalFrames = 0;

  const analyzeFrame = (frame: Float32Array) => {
    totalFrames += 1;
    const [pitch, clarity] = detector.findPitch(frame, sampleRate);
    if (
      pitch > MIN_HZ &&
      pitch < MAX_HZ &&
      clarity >= TUNER_CLARITY &&
      Number.isFinite(pitch)
    ) {
      pitches.push(pitch);
    }
  };

  if (mono.length < FRAME) {
    const padded = new Float32Array(FRAME);
    padded.set(mono.subarray(0, Math.min(mono.length, FRAME)));
    analyzeFrame(padded);
  } else {
    for (let start = 0; start + FRAME <= mono.length; start += HOP) {
      analyzeFrame(mono.subarray(start, start + FRAME));
    }
  }

  if (pitches.length === 0) {
    return { medianHz: 0, validFrames: 0, totalFrames };
  }

  pitches.sort((a, b) => a - b);
  const medianHz = pitches[Math.floor(pitches.length / 2)]!;
  return {
    medianHz,
    validFrames: pitches.length,
    totalFrames,
  };
}

function medianHzFromSorted(hz: number[]): number {
  if (hz.length === 0) return 0;
  const s = [...hz].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

export type CollectPitchFramesOptions = {
  /** Looser thresholds for scale detection / analysis (default). */
  mode?: "tuner" | "scale";
};

/**
 * Pitch track over the clip (same detector settings as aggregate median).
 * Used for per-note / windowed scale analysis — keep separate from UI.
 */
export function collectPitchFrames(
  mono: Float32Array,
  sampleRate: number,
  options?: CollectPitchFramesOptions,
): PitchFrame[] {
  const mode = options?.mode ?? "scale";
  const clarityMin = mode === "tuner" ? TUNER_CLARITY : SCALE_CLARITY;
  const minVol = mode === "tuner" ? TUNER_MIN_VOLUME_DB : SCALE_MIN_VOLUME_DB;
  const maxHz = mode === "tuner" ? MAX_HZ : SCALE_MAX_HZ;

  const detector = PitchDetector.forFloat32Array(FRAME);
  detector.clarityThreshold = clarityMin;
  detector.minVolumeDecibels = minVol;

  const out: PitchFrame[] = [];

  const pushFrame = (startSample: number, frame: Float32Array) => {
    const [pitch, clarity] = detector.findPitch(frame, sampleRate);
    const t = (startSample + FRAME / 2) / sampleRate;
    if (
      pitch > MIN_HZ &&
      pitch < maxHz &&
      clarity >= clarityMin &&
      Number.isFinite(pitch)
    ) {
      out.push({ timeSec: t, hz: pitch, clarity });
    }
  };

  if (mono.length < FRAME) {
    const padded = new Float32Array(FRAME);
    padded.set(mono.subarray(0, Math.min(mono.length, FRAME)));
    pushFrame(0, padded);
  } else {
    for (let start = 0; start + FRAME <= mono.length; start += HOP) {
      pushFrame(start, mono.subarray(start, start + FRAME));
    }
  }

  return out;
}

/**
 * Split the voiced span into `noteCount` equal time windows; median Hz per window.
 *
 * Legacy helper — scale analysis no longer paints expected degrees from equal
 * windows (that invented notes the player never played). Kept for tests and
 * diagnostics.
 */
export function medianHzPerEqualWindow(
  frames: PitchFrame[],
  noteCount: number,
): (number | null)[] {
  if (noteCount <= 0) return [];
  if (frames.length === 0) return Array.from({ length: noteCount }, () => null);

  const t0 = frames[0]!.timeSec;
  const t1 = frames[frames.length - 1]!.timeSec;
  const span = Math.max(t1 - t0, 1e-6);
  const buckets: (number | null)[] = [];

  for (let i = 0; i < noteCount; i++) {
    const w0 = t0 + (i / noteCount) * span;
    const w1 = t0 + ((i + 1) / noteCount) * span;
    const hzIn: number[] = [];
    const last = i === noteCount - 1;
    for (const f of frames) {
      if (last) {
        if (f.timeSec >= w0 && f.timeSec <= w1) hzIn.push(f.hz);
      } else if (f.timeSec >= w0 && f.timeSec < w1) {
        hzIn.push(f.hz);
      }
    }
    if (hzIn.length === 0) {
      buckets.push(null);
    } else {
      buckets.push(medianHzFromSorted(hzIn));
    }
  }

  return buckets;
}

const STABLE_RUN_SEMI_TOL = 0.55;
/** Drop 1–3-frame blips and G→A boundary smears; ~4 hops is a real note. */
const STABLE_RUN_MIN_FRAMES = 4;
/** Neighbour-pitch flicker must last this many frames before splitting a run. */
const SPLIT_HYSTERESIS_FRAMES = 4;
/** Merge same-pitch fragments only across tiny gaps (not a later re-articulation). */
const MERGE_MAX_GAP_SEC = 0.08;
const MERGE_SEMI_TOL = 0.7;

/** Max abs cents to assign a pitch run to an expected scale degree. */
export const DETECTED_NOTE_MATCH_MAX_CENTS = 85;
/** Sequential matching may skip this many unmatched expected degrees (missed notes). */
export const DETECTED_NOTE_MAX_SKIP = 2;

export type StablePitchRun = {
  hz: number[];
  midiCenter: number;
  medianHz: number;
  frameCount: number;
  timeStartSec: number;
  timeEndSec: number;
};

function midiToHzFromMidi(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function rawAbsCents(hz: number, targetHz: number): number {
  return Math.abs(1200 * Math.log2(hz / targetHz));
}

function runFromFrames(buf: PitchFrame[]): StablePitchRun | null {
  if (buf.length < STABLE_RUN_MIN_FRAMES) return null;
  const hz = buf.map((f) => f.hz);
  const midiCenter =
    hz.reduce((sum, h) => sum + hzToMidi(h), 0) / hz.length;
  return {
    hz,
    midiCenter,
    medianHz: medianHzFromSorted(hz),
    frameCount: buf.length,
    timeStartSec: buf[0]!.timeSec,
    timeEndSec: buf[buf.length - 1]!.timeSec,
  };
}

function meanMidi(frames: PitchFrame[]): number {
  return frames.reduce((sum, f) => sum + hzToMidi(f.hz), 0) / frames.length;
}

function mergeAdjacentSamePitchRuns(runs: StablePitchRun[]): StablePitchRun[] {
  if (runs.length === 0) return [];
  const out: StablePitchRun[] = [runs[0]!];
  for (let i = 1; i < runs.length; i++) {
    const prev = out[out.length - 1]!;
    const next = runs[i]!;
    const gap = next.timeStartSec - prev.timeEndSec;
    if (
      Math.abs(prev.midiCenter - next.midiCenter) <= MERGE_SEMI_TOL &&
      gap <= MERGE_MAX_GAP_SEC
    ) {
      const hz = prev.hz.concat(next.hz);
      const frameCount = prev.frameCount + next.frameCount;
      out[out.length - 1] = {
        hz,
        midiCenter:
          (prev.midiCenter * prev.frameCount +
            next.midiCenter * next.frameCount) /
          frameCount,
        medianHz: medianHzFromSorted(hz),
        frameCount,
        timeStartSec: prev.timeStartSec,
        timeEndSec: next.timeEndSec,
      };
    } else {
      out.push(next);
    }
  }
  return out;
}

/**
 * Group consecutive pitch frames into stable pitch runs (note-like plateaus).
 *
 * Brief neighbour-pitch flickers are absorbed into the current run. Extremely
 * short detections are dropped instead of becoming notes.
 */
export function collectStablePitchRuns(frames: PitchFrame[]): StablePitchRun[] {
  if (frames.length === 0) return [];

  const raw: StablePitchRun[] = [];
  let current: PitchFrame[] = [];
  let pendingOut: PitchFrame[] = [];

  const flushCurrent = () => {
    const run = runFromFrames(current);
    if (run) raw.push(run);
    current = [];
  };

  for (const frame of frames) {
    if (current.length === 0) {
      current = [frame];
      pendingOut = [];
      continue;
    }
    const center = meanMidi(current);
    if (Math.abs(hzToMidi(frame.hz) - center) <= STABLE_RUN_SEMI_TOL) {
      pendingOut = [];
      current.push(frame);
      continue;
    }
    pendingOut.push(frame);
    if (pendingOut.length >= SPLIT_HYSTERESIS_FRAMES) {
      flushCurrent();
      current = pendingOut;
      pendingOut = [];
    }
  }
  flushCurrent();
  const trailing = runFromFrames(pendingOut);
  if (trailing) raw.push(trailing);

  return mergeAdjacentSamePitchRuns(raw);
}

/**
 * Map stable pitch runs onto `noteCount` steps (merge extras, reject if too few).
 * Better than equal windows when the player holds some notes longer than others.
 */
export function medianHzPerStableRuns(
  frames: PitchFrame[],
  noteCount: number,
): (number | null)[] | null {
  if (noteCount <= 0) return [];
  if (frames.length === 0) return null;

  const runs = collectStablePitchRuns(frames);
  const minRuns = Math.max(3, Math.floor(noteCount * 0.65));
  if (runs.length < minRuns) return null;

  // Merge shortest run into nearest neighbour until count matches.
  while (runs.length > noteCount) {
    let shortest = 0;
    for (let i = 1; i < runs.length; i++) {
      if (runs[i]!.hz.length < runs[shortest]!.hz.length) shortest = i;
    }
    const mergeInto =
      shortest === 0
        ? 1
        : shortest === runs.length - 1
          ? shortest - 1
          : runs[shortest - 1]!.hz.length <= runs[shortest + 1]!.hz.length
            ? shortest - 1
            : shortest + 1;
    const keep = Math.min(shortest, mergeInto);
    const drop = Math.max(shortest, mergeInto);
    const a = runs[keep]!;
    const b = runs[drop]!;
    const mergedHz = a.hz.concat(b.hz);
    const frameCount = a.frameCount + b.frameCount;
    const midiCenter =
      (a.midiCenter * a.frameCount + b.midiCenter * b.frameCount) /
      frameCount;
    runs[keep] = {
      hz: mergedHz,
      midiCenter,
      medianHz: medianHzFromSorted(mergedHz),
      frameCount,
      timeStartSec: Math.min(a.timeStartSec, b.timeStartSec),
      timeEndSec: Math.max(a.timeEndSec, b.timeEndSec),
    };
    runs.splice(drop, 1);
  }

  if (runs.length < noteCount) return null;

  return runs
    .slice(0, noteCount)
    .map((r) => medianHzFromSorted(r.hz));
}

/** Abs cents folded into one octave so ±1200 (octave error) does not dominate. */
export function octaveWrappedAbsCents(hz: number, targetHz: number): number {
  const cents = 1200 * Math.log2(hz / targetHz);
  const wrapped = cents - 1200 * Math.round(cents / 1200);
  return Math.abs(wrapped);
}

/**
 * Prefer a sub-harmonic when it sits clearly closer to the written note.
 * Violin pitch trackers often lock onto the 2nd harmonic.
 */
export function preferFundamentalNearTargetHz(
  detectedHz: number,
  targetHz: number,
): number {
  if (!(detectedHz > 0) || !(targetHz > 0)) return detectedHz;
  let bestHz = detectedHz;
  let bestRaw = rawAbsCents(detectedHz, targetHz);
  for (const div of [2, 3, 4]) {
    const cand = detectedHz / div;
    if (cand < MIN_HZ) continue;
    const raw = rawAbsCents(cand, targetHz);
    // Only fold when the divided pitch is actually nearer the written note.
    // Wrapped-cents would treat C4/3 (F2) as an “F4 harmonic” and invent matches.
    if (raw + 15 < bestRaw) {
      bestHz = cand;
      bestRaw = raw;
    }
  }
  return bestHz;
}

/**
 * Whether a pitch run is close enough to an expected MIDI to count as that note.
 *
 * `wrapped` allows the same pitch class in another octave (full scale played
 * up an octave). `raw` requires the same octave so a repeated C4 cannot fill C5.
 */
export function runFitsExpectedMidi(
  detectedHz: number,
  expectedMidi: number,
  maxCents: number = DETECTED_NOTE_MATCH_MAX_CENTS,
  mode: "wrapped" | "raw" = "wrapped",
): boolean {
  const target = midiToHzFromMidi(expectedMidi);
  const adj = preferFundamentalNearTargetHz(detectedHz, target);
  if (mode === "wrapped") {
    return octaveWrappedAbsCents(adj, target) <= maxCents;
  }
  return rawAbsCents(adj, target) <= maxCents;
}

/**
 * Map evidenced pitch runs onto expected scale slots.
 *
 * expectedScaleNotes = `expectedMidis` (what the player is supposed to play)
 * detectedNotes      = non-null slots (runs with enough audio evidence)
 *
 * Unplayed expected notes stay `null`. Runs are never resized to the expected
 * length, and leftover audio is not painted onto later scale degrees.
 */
export function matchDetectedRunsToExpected(
  runs: StablePitchRun[],
  expectedMidis: readonly number[],
): Array<number | null> {
  const n = expectedMidis.length;
  const slots: Array<number | null> = Array.from({ length: n }, () => null);
  if (n === 0 || runs.length === 0) return slots;

  const used = new Array<boolean>(runs.length).fill(false);

  let cursor = 0;
  for (let ri = 0; ri < runs.length; ri++) {
    const hz = runs[ri]!.medianHz;
    let found = -1;
    const searchEnd = Math.min(n - 1, cursor + DETECTED_NOTE_MAX_SKIP);
    for (let j = cursor; j <= searchEnd; j++) {
      if (slots[j] != null) continue;
      if (
        runFitsExpectedMidi(
          hz,
          expectedMidis[j]!,
          DETECTED_NOTE_MATCH_MAX_CENTS,
          "wrapped",
        )
      ) {
        found = j;
        break;
      }
    }
    if (found >= 0) {
      const target = midiToHzFromMidi(expectedMidis[found]!);
      slots[found] = preferFundamentalNearTargetHz(hz, target);
      used[ri] = true;
      cursor = found + 1;
    }
  }

  // Out-of-order leftovers may only fill earlier unmatched slots (e.g. D then C).
  // Do not assign a leftover C4 onto a later C in the round-trip.
  for (let ri = 0; ri < runs.length; ri++) {
    if (used[ri]) continue;
    const hz = runs[ri]!.medianHz;
    let bestJ = -1;
    let bestCents = Infinity;
    for (let j = 0; j < cursor; j++) {
      if (slots[j] != null) continue;
      const target = midiToHzFromMidi(expectedMidis[j]!);
      const adj = preferFundamentalNearTargetHz(hz, target);
      const cents = rawAbsCents(adj, target);
      if (cents <= DETECTED_NOTE_MATCH_MAX_CENTS && cents < bestCents) {
        bestCents = cents;
        bestJ = j;
      }
    }
    if (bestJ >= 0) {
      const target = midiToHzFromMidi(expectedMidis[bestJ]!);
      slots[bestJ] = preferFundamentalNearTargetHz(hz, target);
      used[ri] = true;
    }
  }

  return slots;
}

/**
 * Per-expected-slot Hz from evidenced pitch runs only.
 *
 * Missing expected notes stay null. Do not use equal-time windows: those fill
 * every scale degree from whatever audio happens to fall in that slice.
 */
export function medianHzPerScaleSteps(
  frames: PitchFrame[],
  expectedMidis: readonly number[],
): (number | null)[] {
  const noteCount = expectedMidis.length;
  if (noteCount <= 0) return [];
  if (frames.length === 0) {
    return Array.from({ length: noteCount }, () => null);
  }
  return matchDetectedRunsToExpected(
    collectStablePitchRuns(frames),
    expectedMidis,
  );
}
