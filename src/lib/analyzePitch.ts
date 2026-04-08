import { PitchDetector } from "pitchy";

const FRAME = 4096;
const HOP = 2048;
const MIN_HZ = 80;
const MAX_HZ = 5000;

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
  detector.clarityThreshold = 0.82;
  detector.minVolumeDecibels = -38;

  const pitches: number[] = [];
  let totalFrames = 0;

  const analyzeFrame = (frame: Float32Array) => {
    totalFrames += 1;
    const [pitch, clarity] = detector.findPitch(frame, sampleRate);
    if (
      pitch > MIN_HZ &&
      pitch < MAX_HZ &&
      clarity >= 0.82 &&
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

/**
 * Pitch track over the clip (same detector settings as aggregate median).
 * Used for per-note / windowed scale analysis — keep separate from UI.
 */
export function collectPitchFrames(
  mono: Float32Array,
  sampleRate: number,
): PitchFrame[] {
  const detector = PitchDetector.forFloat32Array(FRAME);
  detector.clarityThreshold = 0.82;
  detector.minVolumeDecibels = -38;

  const out: PitchFrame[] = [];

  const pushFrame = (startSample: number, frame: Float32Array) => {
    const [pitch, clarity] = detector.findPitch(frame, sampleRate);
    const t = (startSample + FRAME / 2) / sampleRate;
    if (
      pitch > MIN_HZ &&
      pitch < MAX_HZ &&
      clarity >= 0.82 &&
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

  const t0 = frames[0].timeSec;
  const t1 = frames[frames.length - 1].timeSec;
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
