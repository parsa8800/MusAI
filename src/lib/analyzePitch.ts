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
 * Aligns one window per expected scale degree (ascending performance model).
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
const STABLE_RUN_MIN_FRAMES = 2;

type HzRun = { hz: number[]; midiCenter: number };

/**
 * Group consecutive pitch frames into stable pitch runs (note-like plateaus).
 * Returns null when segmentation is too weak to trust (caller should fall back).
 */
export function collectStablePitchRuns(frames: PitchFrame[]): HzRun[] {
  if (frames.length === 0) return [];

  const runs: HzRun[] = [];
  let hzBuf: number[] = [frames[0]!.hz];
  let midiSum = hzToMidi(frames[0]!.hz);
  let midiCount = 1;
  let center = midiSum;

  const flush = () => {
    if (hzBuf.length >= STABLE_RUN_MIN_FRAMES) {
      runs.push({ hz: hzBuf, midiCenter: midiSum / midiCount });
    }
  };

  for (let i = 1; i < frames.length; i++) {
    const m = hzToMidi(frames[i]!.hz);
    if (Math.abs(m - center) <= STABLE_RUN_SEMI_TOL) {
      hzBuf.push(frames[i]!.hz);
      midiSum += m;
      midiCount += 1;
      center = midiSum / midiCount;
    } else {
      flush();
      hzBuf = [frames[i]!.hz];
      midiSum = m;
      midiCount = 1;
      center = m;
    }
  }
  flush();
  return runs;
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
    const midiCenter =
      (a.midiCenter * a.hz.length + b.midiCenter * b.hz.length) /
      mergedHz.length;
    runs[keep] = { hz: mergedHz, midiCenter };
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
  let bestErr = octaveWrappedAbsCents(detectedHz, targetHz);
  for (const div of [2, 3, 4]) {
    const cand = detectedHz / div;
    if (cand < MIN_HZ) continue;
    const e = octaveWrappedAbsCents(cand, targetHz);
    // Prefer a clearly better fit, or the same fit at a lower (fundamental) octave.
    if (e + 15 < bestErr || (e <= bestErr + 5 && cand < bestHz * 0.75)) {
      bestHz = cand;
      bestErr = e;
    }
  }
  return bestHz;
}

/**
 * Choose equal-window vs stable-run segmentation by lowest total intonation error
 * against expected MIDI targets.
 */
export function medianHzPerScaleSteps(
  frames: PitchFrame[],
  expectedMidis: readonly number[],
): (number | null)[] {
  const noteCount = expectedMidis.length;
  if (noteCount <= 0) return [];
  if (frames.length === 0) return Array.from({ length: noteCount }, () => null);

  const equal = medianHzPerEqualWindow(frames, noteCount);
  const stable = medianHzPerStableRuns(frames, noteCount);

  const score = (buckets: (number | null)[]): number => {
    let total = 0;
    let counted = 0;
    for (let i = 0; i < noteCount; i++) {
      const hz = buckets[i];
      if (hz == null || hz <= 0) {
        total += 800;
        continue;
      }
      const target = 440 * Math.pow(2, (expectedMidis[i]! - 69) / 12);
      const hzAdj = preferFundamentalNearTargetHz(hz, target);
      total += octaveWrappedAbsCents(hzAdj, target);
      counted += 1;
    }
    if (counted === 0) return Number.POSITIVE_INFINITY;
    // Prefer coverings that actually measured most notes.
    return total / counted + (noteCount - counted) * 120;
  };

  if (!stable) return equal;
  return score(stable) < score(equal) * 0.92 ? stable : equal;
}
