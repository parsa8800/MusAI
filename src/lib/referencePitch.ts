import { createAudioContext } from "@/lib/audioContext";
import { midiToHz } from "@/lib/intonation";

let sharedCtx: AudioContext | null = null;

type Voice = {
  osc: OscillatorNode;
  gain: GainNode;
};

const latchedVoices = new Map<number, Voice>();
let holdVoice: Voice | null = null;

const ATTACK = 0.04;
const RELEASE = 0.09;
/** Per-voice peak; several notes may stack without clipping badly. */
const PEAK = 0.085;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!sharedCtx) {
      sharedCtx = createAudioContext();
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

function fadeOutStop(v: Voice): void {
  const ctx = sharedCtx;
  if (!ctx) return;
  const t = ctx.currentTime;
  try {
    v.gain.gain.cancelScheduledValues(t);
    const gv = Math.max(v.gain.gain.value, 0.0001);
    v.gain.gain.setValueAtTime(gv, t);
    v.gain.gain.exponentialRampToValueAtTime(0.0001, t + RELEASE);
    v.osc.stop(t + RELEASE + 0.03);
  } catch {
    try {
      v.osc.disconnect();
      v.gain.disconnect();
    } catch {
      /* ignore */
    }
  }
}

function createVoice(midi: number, ctx: AudioContext): Voice {
  const freq = midiToHz(midi);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  const t0 = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(PEAK, t0 + ATTACK);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  return { osc, gain };
}

/**
 * Plays a short sine preview (e.g. octave nudge).
 */
export function playReferenceTone(
  midi: number,
  durationSec = 0.42,
): void {
  if (typeof window === "undefined") return;
  try {
    const ctx = ensureCtx();
    if (!ctx) return;
    void ctx.resume();

    const freq = midiToHz(midi);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    const t0 = ctx.currentTime;
    const attack = 0.025;
    const peak = 0.22;

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + durationSec + 0.06);
  } catch {
    /* ignore */
  }
}

/** Pointer / key hold: one voice; slides to a new MIDI by retuning. */
export function startHoldReference(midi: number): void {
  const ctx = ensureCtx();
  if (!ctx) return;
  void ctx.resume();

  if (holdVoice) {
    const t = ctx.currentTime;
    const freq = midiToHz(midi);
    try {
      holdVoice.osc.frequency.linearRampToValueAtTime(freq, t + 0.045);
    } catch {
      stopHoldReference();
      startHoldReference(midi);
    }
    return;
  }

  try {
    holdVoice = createVoice(midi, ctx);
  } catch {
    holdVoice = null;
  }
}

export function stopHoldReference(): void {
  if (!holdVoice) return;
  const v = holdVoice;
  holdVoice = null;
  fadeOutStop(v);
}

function startLatchedVoiceInternal(midi: number): void {
  if (latchedVoices.has(midi)) return;
  const ctx = ensureCtx();
  if (!ctx) return;
  void ctx.resume();
  try {
    latchedVoices.set(midi, createVoice(midi, ctx));
  } catch {
    latchedVoices.delete(midi);
  }
}

function stopLatchedVoiceInternal(midi: number): void {
  const v = latchedVoices.get(midi);
  if (!v) return;
  latchedVoices.delete(midi);
  fadeOutStop(v);
}

/**
 * Make Web Audio latched layer match React state (Strict Mode–safe).
 */
export function syncLatchedReferences(desired: ReadonlySet<number>): void {
  for (const m of [...latchedVoices.keys()]) {
    if (!desired.has(m)) stopLatchedVoiceInternal(m);
  }
  for (const m of desired) {
    if (!latchedVoices.has(m)) startLatchedVoiceInternal(m);
  }
}

export function stopAllLatchedReference(): void {
  for (const m of [...latchedVoices.keys()]) {
    stopLatchedVoiceInternal(m);
  }
}
