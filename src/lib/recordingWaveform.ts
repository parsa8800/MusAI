/** Live collector cap — ~36s at 24ms; oldest samples drop off the left. */
export const WAVEFORM_LIVE_MAX = 1500;
/** Stored with a take for later replay in history. */
export const WAVEFORM_STORE_MAX = 240;
/** Fallback column count before the well has been measured. */
export const WAVEFORM_UI_COLUMNS = 64;
export const WAVEFORM_COLUMNS_MIN = 32;
export const WAVEFORM_COLUMNS_MAX = 180;
/** Bar + gap. Volume never changes this — only height. */
export const WAVEFORM_BAR_PITCH_PX = 4;
/** Thin Voice Memos-style stroke. */
export const WAVEFORM_BAR_WIDTH_PX = 1.5;
/** How often we stamp a new bar. Horizontal speed is pitch / this. */
export const WAVEFORM_SAMPLE_MS = 24;
export const WAVEFORM_PLAYHEAD_INSET_PX = 7;
/** Light height smoothing — keeps neighbours from jumping. */
export const WAVEFORM_SMOOTH_ALPHA = 0.34;

/**
 * `tape` — compact Scale Studio Voice Memos strip (short takes).
 * `timeline` — reserved for Piece Studio: full-width scrubber with markers.
 */
export type WaveformLayout = "tape" | "timeline";

/** Timestamp cue for Piece Studio feedback (ms from take start). */
export type WaveformMarker = {
  id: string;
  timeMs: number;
  label?: string;
};

export type WaveformLiveClock = {
  samples: number[];
  times: number[];
};

export function clampAmplitude(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * RMS of a time-domain analyser frame.
 * Byte data is centered on 128; float data is -1..1.
 */
export function rmsFromTimeDomain(data: Uint8Array | Float32Array): number {
  if (data.length === 0) return 0;
  let sum = 0;
  if (data instanceof Uint8Array) {
    for (let i = 0; i < data.length; i++) {
      const x = (data[i]! - 128) / 128;
      sum += x * x;
    }
  } else {
    for (let i = 0; i < data.length; i++) {
      const x = data[i]!;
      sum += x * x;
    }
  }
  return Math.sqrt(sum / data.length);
}

/** Map RMS to a 0–1 display amplitude. Silence stays tiny; bows reach the top. */
export function shapeRecordingAmplitude(rms: number): number {
  const boosted = rms * 3.8;
  if (boosted <= 0.016) return Math.max(0.03, boosted * 0.55);
  return clampAmplitude(boosted);
}

/** Exponential moving average so bar heights feel fluid. */
export function smoothAmplitude(
  previous: number,
  next: number,
  alpha = WAVEFORM_SMOOTH_ALPHA,
): number {
  const a = Math.min(1, Math.max(0, alpha));
  return clampAmplitude(previous * (1 - a) + next * a);
}

export function liveWaveformPxPerMs(
  pitchPx = WAVEFORM_BAR_PITCH_PX,
  sampleMs = WAVEFORM_SAMPLE_MS,
): number {
  return pitchPx / Math.max(1, sampleMs);
}

/**
 * Horizontal position for a live bar. Time only — amplitude must not be used.
 * Newest audio sits at the playhead (right); older audio travels left.
 */
export function liveWaveformBarX(
  now: number,
  sampleTime: number,
  playheadX: number,
  pxPerMs = liveWaveformPxPerMs(),
): number {
  return playheadX - (now - sampleTime) * pxPerMs;
}

/** How many thin bars fit in a well without overflowing. */
export function waveformColumnCount(widthPx: number): number {
  if (widthPx <= 0) return 0;
  const n = Math.floor(widthPx / WAVEFORM_BAR_PITCH_PX);
  if (n <= 0) return 0;
  return Math.min(
    WAVEFORM_COLUMNS_MAX,
    Math.max(WAVEFORM_COLUMNS_MIN, n),
  );
}

/** Peak-bin downsample so loud attacks survive compression. */
export function downsampleAmplitudes(
  samples: readonly number[],
  maxPoints: number,
): number[] {
  if (maxPoints <= 0) return [];
  if (samples.length === 0) return [];
  if (samples.length <= maxPoints) {
    return samples.map(clampAmplitude);
  }
  const out: number[] = [];
  const bucket = samples.length / maxPoints;
  for (let i = 0; i < maxPoints; i++) {
    const start = Math.floor(i * bucket);
    const end = Math.max(start + 1, Math.floor((i + 1) * bucket));
    let peak = 0;
    for (let j = start; j < end && j < samples.length; j++) {
      peak = Math.max(peak, clampAmplitude(samples[j]!));
    }
    out.push(peak);
  }
  return out;
}

/**
 * Live Voice Memos window: newest sample is at the right (playhead).
 * Older history scrolls off the left. Empty left space stays empty — no fake bars.
 */
export function liveWaveformWindow(
  samples: readonly number[],
  columns: number,
): number[] {
  const n = Math.max(0, columns);
  if (n <= 0 || samples.length === 0) return [];
  return samples.slice(-n).map(clampAmplitude);
}

/**
 * Completed take: keep real bars only. Short takes stay compact (right-aligned in UI).
 * Long takes downsample to the visible column budget.
 */
export function waveformColumns(
  samples: readonly number[],
  columns: number,
): number[] {
  const n = Math.max(0, columns);
  if (n <= 0 || samples.length === 0) return [];
  if (samples.length <= n) return samples.map(clampAmplitude);
  return downsampleAmplitudes(samples, n);
}

/**
 * Map a marker time onto a 0–1 horizontal position for a finished take.
 * Used by Piece Studio timeline layout; Scale Studio tape ignores markers.
 */
export function waveformMarkerProgress(
  timeMs: number,
  durationMs: number,
): number {
  if (!Number.isFinite(timeMs) || !Number.isFinite(durationMs) || durationMs <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, timeMs / durationMs));
}

export function createWaveformCollector(maxLive = WAVEFORM_LIVE_MAX) {
  let samples: number[] = [];

  return {
    reset() {
      samples = [];
    },
    push(value: number) {
      samples.push(clampAmplitude(value));
      if (samples.length > maxLive) {
        samples.splice(0, samples.length - maxLive);
      }
    },
    snapshot(): number[] {
      return samples.slice();
    },
    stored(maxPoints = WAVEFORM_STORE_MAX): number[] {
      return downsampleAmplitudes(samples, maxPoints);
    },
  };
}
