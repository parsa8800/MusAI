import { describe, expect, it } from "vitest";
import {
  createWaveformCollector,
  downsampleAmplitudes,
  liveWaveformBarX,
  liveWaveformPxPerMs,
  liveWaveformWindow,
  rmsFromTimeDomain,
  shapeRecordingAmplitude,
  smoothAmplitude,
  WAVEFORM_BAR_PITCH_PX,
  WAVEFORM_COLUMNS_MAX,
  WAVEFORM_COLUMNS_MIN,
  WAVEFORM_SAMPLE_MS,
  WAVEFORM_STORE_MAX,
  waveformColumnCount,
  waveformColumns,
  waveformMarkerProgress,
} from "@/lib/recordingWaveform";

function byteTone(amplitude: number, length = 64): Uint8Array {
  const data = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    const x = Math.sin((i / length) * Math.PI * 2) * amplitude;
    data[i] = Math.max(0, Math.min(255, Math.round(128 + x * 127)));
  }
  return data;
}

describe("recordingWaveform", () => {
  it("gives near-zero RMS for silence", () => {
    const silence = new Uint8Array(128).fill(128);
    expect(rmsFromTimeDomain(silence)).toBeLessThan(0.01);
    expect(shapeRecordingAmplitude(rmsFromTimeDomain(silence))).toBeLessThan(
      0.05,
    );
  });

  it("gives a larger amplitude for louder input than quiet input", () => {
    const quiet = shapeRecordingAmplitude(rmsFromTimeDomain(byteTone(0.12)));
    const loud = shapeRecordingAmplitude(rmsFromTimeDomain(byteTone(0.85)));
    expect(loud).toBeGreaterThan(quiet);
    expect(loud).toBeGreaterThan(0.4);
  });

  it("keeps sample history growing and preserves it after a pause", () => {
    const collector = createWaveformCollector(20);
    collector.push(0.1);
    collector.push(0.8);
    collector.push(0.2);
    expect(collector.snapshot()).toEqual([0.1, 0.8, 0.2]);
    const frozen = collector.snapshot();
    expect(frozen).toEqual([0.1, 0.8, 0.2]);
  });

  it("resets when a new take starts", () => {
    const collector = createWaveformCollector();
    collector.push(0.9);
    collector.reset();
    expect(collector.snapshot()).toEqual([]);
    collector.push(0.2);
    expect(collector.snapshot()).toEqual([0.2]);
  });

  it("downsamples stored takes without exceeding the UI budget", () => {
    const long = Array.from({ length: 900 }, (_, i) => (i % 7 === 0 ? 0.9 : 0.1));
    const stored = downsampleAmplitudes(long, WAVEFORM_STORE_MAX);
    expect(stored).toHaveLength(WAVEFORM_STORE_MAX);
    expect(Math.max(...stored)).toBeGreaterThan(0.8);
  });

  it("keeps the newest live sample at the right-hand playhead", () => {
    const cols = liveWaveformWindow([0.2, 0.9], 6);
    expect(cols).toEqual([0.2, 0.9]);
    expect(cols[cols.length - 1]).toBe(0.9);
  });

  it("scrolls older live history off the left when the window is full", () => {
    const cols = liveWaveformWindow([0.1, 0.2, 0.3, 0.4, 0.5], 3);
    expect(cols).toEqual([0.3, 0.4, 0.5]);
  });

  it("places newer live bars to the right of older ones using time only", () => {
    const playhead = 200;
    const pxPerMs = liveWaveformPxPerMs();
    const older = liveWaveformBarX(1000, 800, playhead, pxPerMs);
    const newer = liveWaveformBarX(1000, 950, playhead, pxPerMs);
    expect(newer).toBeGreaterThan(older);
    expect(newer).toBeCloseTo(playhead - 50 * pxPerMs);
    expect(pxPerMs).toBeCloseTo(WAVEFORM_BAR_PITCH_PX / WAVEFORM_SAMPLE_MS);
    const later = liveWaveformBarX(1100, 950, playhead, pxPerMs);
    expect(later).toBeLessThan(newer);
  });

  it("smooths amplitude without changing the 0–1 range", () => {
    const jumped = smoothAmplitude(0.1, 0.9, 0.34);
    expect(jumped).toBeGreaterThan(0.1);
    expect(jumped).toBeLessThan(0.9);
    expect(smoothAmplitude(0.4, 0.4, 0.34)).toBeCloseTo(0.4);
  });

  it("drops the oldest live samples instead of reshaping the timeline", () => {
    const collector = createWaveformCollector(3);
    collector.push(0.1);
    collector.push(0.2);
    collector.push(0.3);
    collector.push(0.4);
    expect(collector.snapshot()).toEqual([0.2, 0.3, 0.4]);
  });

  it("does not invent quiet bars to fill empty space", () => {
    expect(liveWaveformWindow([], 6)).toEqual([]);
    expect(waveformColumns([], 8)).toEqual([]);
  });

  it("keeps a short finished take compact instead of stretching it", () => {
    const cols = waveformColumns([0.2, 0.9], 4);
    expect(cols).toEqual([0.2, 0.9]);
  });

  it("places markers between 0 and 1 for a finished timeline", () => {
    expect(waveformMarkerProgress(0, 4000)).toBe(0);
    expect(waveformMarkerProgress(1000, 4000)).toBeCloseTo(0.25);
    expect(waveformMarkerProgress(4000, 4000)).toBe(1);
    expect(waveformMarkerProgress(8000, 4000)).toBe(1);
  });

  it("clamps column count to a thin-bar range", () => {
    expect(waveformColumnCount(0)).toBe(0);
    expect(waveformColumnCount(40)).toBe(WAVEFORM_COLUMNS_MIN);
    expect(waveformColumnCount(2000)).toBe(WAVEFORM_COLUMNS_MAX);
    expect(waveformColumnCount(220)).toBeGreaterThan(WAVEFORM_COLUMNS_MIN);
    expect(waveformColumnCount(220)).toBeLessThan(WAVEFORM_COLUMNS_MAX);
  });
});
