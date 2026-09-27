/**
 * Visual string motion for the tuner. Pitch detection stays separate;
 * this only maps already-detected Hz / RMS / cents into a standing wave.
 */

export type TunerMotionFrame = {
  activeId: string | null;
  hz: number;
  rms: number;
  cents: number;
  inTune: boolean;
  alive: boolean;
};

const VISUAL_HZ_MIN = 2.35;
const VISUAL_HZ_MAX = 5.4;
const C3_HZ = 130.81;
const E5_HZ = 659.25;
const MAX_AMP = 5.8;
const IN_TUNE_AMP = 2.7;
const MAX_BIAS = 2.6;
const STRAIGHT_EPS = 0.045;

export function visualHzFromPitch(hz: number): number {
  if (!Number.isFinite(hz) || hz <= 0) return VISUAL_HZ_MIN;
  const t = Math.log2(hz / C3_HZ) / Math.log2(E5_HZ / C3_HZ);
  const clamped = Math.min(1, Math.max(0, t));
  return VISUAL_HZ_MIN + (VISUAL_HZ_MAX - VISUAL_HZ_MIN) * clamped;
}

/** Mic RMS → 0–1 energy. Violin/viola bows sit in a quiet RMS band. */
export function energyFromRms(rms: number): number {
  if (!Number.isFinite(rms) || rms <= 0) return 0;
  const boosted = rms * 16;
  if (boosted < 0.012) return 0;
  return Math.min(1, Math.max(0, (boosted - 0.012) / 0.72));
}

export function amplitudeFromEnergy(energy: number, inTune: boolean): number {
  const cap = inTune ? IN_TUNE_AMP : MAX_AMP;
  return Math.min(cap, Math.max(0, energy) * cap);
}

/** Negative cents (flat) lean left; sharp leans right. In tune is 0. */
export function biasFromCents(cents: number, inTune: boolean): number {
  if (inTune || !Number.isFinite(cents)) return 0;
  const t = Math.max(-1, Math.min(1, cents / 42));
  return t * MAX_BIAS;
}

export function smoothToward(
  current: number,
  target: number,
  attack: number,
  release: number,
  dt = 1 / 60,
): number {
  const rate = target > current ? attack : release;
  const k = 1 - Math.exp(-rate * 60 * Math.max(0, dt));
  return current + (target - current) * k;
}

/**
 * Standing wave, ends fixed. Fundamental arch + a quiet second harmonic.
 * `phase` is radians; `bias` shifts the antinode without moving the nut/bridge.
 */
export function standingWavePath(
  restX: number,
  topY: number,
  bottomY: number,
  amp: number,
  bias: number,
  phase: number,
  steps = 12,
): string {
  if (Math.abs(amp) < STRAIGHT_EPS && Math.abs(bias) < STRAIGHT_EPS) {
    return `M ${restX} ${topY} L ${restX} ${bottomY}`;
  }

  const len = bottomY - topY;
  const fund = Math.sin(phase);
  const harm = Math.sin(2 * phase + 0.35);
  const n = Math.max(6, steps);
  let d = `M ${restX} ${topY}`;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const y = topY + t * len;
    const node = Math.sin(Math.PI * t);
    const node2 = Math.sin(2 * Math.PI * t);
    const x = restX + (bias + amp * fund) * node + amp * 0.14 * harm * node2;
    d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d;
}

export const STRING_MOTION_ATTACK = 0.28;
export const STRING_MOTION_RELEASE = 0.085;
export const STRING_BIAS_SMOOTH = 0.14;
export const STRING_HZ_SMOOTH = 0.1;
