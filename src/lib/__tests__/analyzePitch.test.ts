import { describe, expect, it } from "vitest";
import { bufferToMono, estimatePitchMedianHz } from "../analyzePitch";

function mockAudioBuffer(channels: Float32Array[]): AudioBuffer {
  const length = channels[0]!.length;
  return {
    length,
    numberOfChannels: channels.length,
    sampleRate: 44100,
    duration: length / 44100,
    getChannelData: (i: number) => channels[i]!,
  } as AudioBuffer;
}

/** Sine at frequency Hz, amplitude in 0..1 */
function sineMono(
  freqHz: number,
  sampleRate: number,
  durationSec: number,
): Float32Array {
  const n = Math.floor(sampleRate * durationSec);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = Math.sin((2 * Math.PI * freqHz * i) / sampleRate) * 0.85;
  }
  return out;
}

describe("bufferToMono", () => {
  it("copies single channel", () => {
    const ch = new Float32Array([0.25, -0.5, 0.75]);
    const buf = mockAudioBuffer([ch]);
    const mono = bufferToMono(buf);
    expect(mono.length).toBe(3);
    expect(mono[0]).toBeCloseTo(0.25);
    expect(mono[1]).toBeCloseTo(-0.5);
  });

  it("averages stereo", () => {
    const l = new Float32Array([1, 0, 0.5]);
    const r = new Float32Array([-1, 2, 0.5]);
    const buf = mockAudioBuffer([l, r]);
    const mono = bufferToMono(buf);
    expect(mono[0]).toBeCloseTo(0);
    expect(mono[1]).toBeCloseTo(1);
    expect(mono[2]).toBeCloseTo(0.5);
  });
});

describe("estimatePitchMedianHz", () => {
  it("detects ~440 Hz from a long sine (pitchy)", () => {
    const sampleRate = 44100;
    const mono = sineMono(440, sampleRate, 3);
    const { medianHz, validFrames, totalFrames } = estimatePitchMedianHz(
      mono,
      sampleRate,
    );
    expect(totalFrames).toBeGreaterThan(0);
    expect(validFrames).toBeGreaterThan(0);
    expect(medianHz).toBeGreaterThan(420);
    expect(medianHz).toBeLessThan(460);
  });

  it("returns zeros for silence", () => {
    const mono = new Float32Array(8192);
    const r = estimatePitchMedianHz(mono, 44100);
    expect(r.validFrames).toBe(0);
    expect(r.medianHz).toBe(0);
  });

  it("handles short buffer with padding path", () => {
    const mono = sineMono(330, 44100, 0.05);
    const r = estimatePitchMedianHz(mono, 44100);
    expect(r.totalFrames).toBeGreaterThanOrEqual(1);
  });
});
