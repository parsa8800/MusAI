/**
 * Soft practice metronome clicks. Kept separate from the sampled instrument
 * so ticks stay on-time even when piano voices are busy.
 */
export type PieceMetronome = {
  click: (when: number, accent: boolean) => void;
  silence: () => void;
};

export function createPieceMetronome(ctx: AudioContext): PieceMetronome {
  const active: OscillatorNode[] = [];

  const click = (when: number, accent: boolean) => {
    const t = Math.max(when, ctx.currentTime + 0.01);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(accent ? 1320 : 980, t);
    const peak = accent ? 0.07 : 0.045;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.055);
    active.push(osc);
    osc.onended = () => {
      const i = active.indexOf(osc);
      if (i >= 0) active.splice(i, 1);
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        /* ignore */
      }
    };
  };

  return {
    click,
    silence: () => {
      for (const osc of active) {
        try {
          osc.stop();
        } catch {
          /* ignore */
        }
      }
      active.length = 0;
    },
  };
}
