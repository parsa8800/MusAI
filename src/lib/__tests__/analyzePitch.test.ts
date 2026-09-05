import { describe, expect, it } from "vitest";
import {
  bufferToMono,
  collectStablePitchRuns,
  estimatePitchMedianHz,
  hzToMidi,
  medianHzPerEqualWindow,
  medianHzPerScaleSteps,
  medianHzPerStableRuns,
  type PitchFrame,
} from "../analyzePitch";
import { midiToHz } from "../intonation";
import { buildExerciseScaleMidis } from "../scales";

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

function framesFromHzTimeline(
  timeline: Array<{ hz: number; count: number }>,
  dt = 0.05,
): PitchFrame[] {
  const out: PitchFrame[] = [];
  let t = 0;
  for (const step of timeline) {
    for (let i = 0; i < step.count; i++) {
      out.push({ timeSec: t, hz: step.hz, clarity: 0.95 });
      t += dt;
    }
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

describe("stable pitch run segmentation", () => {
  it("collectStablePitchRuns finds one plateau per pitch", () => {
    const frames = framesFromHzTimeline([
      { hz: midiToHz(60), count: 6 },
      { hz: midiToHz(62), count: 6 },
      { hz: midiToHz(64), count: 6 },
    ]);
    const runs = collectStablePitchRuns(frames);
    expect(runs).toHaveLength(3);
    expect(Math.round(hzToMidi(runs[0]!.hz[0]!))).toBe(60);
    expect(Math.round(hzToMidi(runs[2]!.hz[0]!))).toBe(64);
  });

  it("medianHzPerStableRuns maps plateaus onto expected count", () => {
    const midis = [60, 62, 64, 65, 67];
    const frames = framesFromHzTimeline(
      midis.map((m) => ({ hz: midiToHz(m), count: 5 })),
    );
    const buckets = medianHzPerStableRuns(frames, midis.length);
    expect(buckets).not.toBeNull();
    expect(buckets).toHaveLength(5);
    for (let i = 0; i < midis.length; i++) {
      expect(hzToMidi(buckets![i]!)).toBeCloseTo(midis[i]!, 0);
    }
  });

  it("medianHzPerScaleSteps prefers stable runs on uneven timing", () => {
    const expected = buildExerciseScaleMidis(60, "major", 1);
    // Alternate 3 vs 10 frames so equal windows smear neighbours.
    const timeline = expected.map((m, i) => ({
      hz: midiToHz(m),
      count: i % 2 === 0 ? 3 : 10,
    }));
    const frames = framesFromHzTimeline(timeline, 0.04);
    const equal = medianHzPerEqualWindow(frames, expected.length);
    const chosen = medianHzPerScaleSteps(frames, expected);

    const err = (buckets: (number | null)[]) =>
      buckets.reduce((sum, hz, i) => {
        if (hz == null) return sum + 500;
        return sum + Math.abs(hzToMidi(hz) - expected[i]!);
      }, 0);

    expect(err(chosen)).toBeLessThanOrEqual(err(equal) + 0.01);
    expect(err(chosen)).toBeLessThan(expected.length * 0.75);
  });
});
