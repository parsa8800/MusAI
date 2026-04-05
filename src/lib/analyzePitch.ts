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
