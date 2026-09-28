/**
 * Practice metronome clicks. Kept separate from the sampled instrument
 * so ticks stay on-time even when piano voices are busy.
 *
 * Level 0 is a soft tick. Level 100 is a clear click over the piece.
 * The default sits high enough to hear without opening the slider.
 */
export const PIECE_CLICK_LEVEL_DEFAULT = 72;

export function pieceClickGain(level: number): number {
  const t = Math.max(0, Math.min(100, Math.round(Number.isFinite(level) ? level : 0)));
  return 0.22 + (t / 100) * 0.78;
}

export type PieceMetronome = {
  click: (when: number, accent: boolean) => void;
  setLevel: (level: number) => void;
  silence: () => void;
};

type LiveClick = {
  stop: () => void;
  gain: AudioParam;
};

export function createPieceMetronome(ctx: AudioContext): PieceMetronome {
  const master = ctx.createGain();
  master.gain.value = pieceClickGain(PIECE_CLICK_LEVEL_DEFAULT);
  master.connect(ctx.destination);

  const ticks = Math.max(1, Math.floor(ctx.sampleRate * 0.02));
  const tickBuffer = ctx.createBuffer(1, ticks, ctx.sampleRate);
  const data = tickBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const env = Math.exp(-i / (ctx.sampleRate * 0.0032));
    data[i] = (Math.random() * 2 - 1) * env;
  }

  const active: LiveClick[] = [];

  const track = (node: AudioBufferSourceNode | OscillatorNode, gain: GainNode) => {
    const entry: LiveClick = {
      gain: gain.gain,
      stop: () => {
        try {
          node.stop();
        } catch {
          /* already stopped */
        }
      },
    };
    active.push(entry);
    node.onended = () => {
      const i = active.indexOf(entry);
      if (i >= 0) active.splice(i, 1);
      try {
        node.disconnect();
        gain.disconnect();
      } catch {
        /* ignore */
      }
    };
  };

  const click = (when: number, accent: boolean) => {
    const t = Math.max(when, ctx.currentTime + 0.005);
    const peak = accent ? 0.62 : 0.4;

    const noise = ctx.createBufferSource();
    noise.buffer = tickBuffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(peak, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);
    noise.connect(noiseGain);
    noiseGain.connect(master);
    noise.start(t);
    noise.stop(t + 0.04);
    track(noise, noiseGain);

    const osc = ctx.createOscillator();
    const tone = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(accent ? 1560 : 1080, t);
    tone.gain.setValueAtTime(0.0001, t);
    tone.gain.exponentialRampToValueAtTime(peak * 0.45, t + 0.003);
    tone.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(tone);
    tone.connect(master);
    osc.start(t);
    osc.stop(t + 0.06);
    track(osc, tone);
  };

  return {
    click,
    setLevel: (level: number) => {
      master.gain.setValueAtTime(pieceClickGain(level), ctx.currentTime);
    },
    silence: () => {
      const now = ctx.currentTime;
      for (const entry of active) {
        try {
          entry.gain.cancelScheduledValues(now);
          entry.gain.setValueAtTime(0, now);
        } catch {
          /* ignore */
        }
        entry.stop();
      }
      active.length = 0;
    },
  };
}
