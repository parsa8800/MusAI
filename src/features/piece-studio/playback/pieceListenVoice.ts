import type { ListenSoundfont } from "@/lib/instrument";
import type { PieceInstrumentId } from "@/features/piece-studio/playback/pieceInstrument";

/**
 * The old listen-voice toggle stays piano. The Settings instrument chooses
 * the sound: violin uses the recorded samples, piano and viola stay on the
 * grand piano.
 */
export type PieceListenVoice = "piano" | "strings";

export const PIECE_LISTEN_VOICE_KEY = "musai-piece-listen-voice";

export function parsePieceListenVoice(_raw: string | null): PieceListenVoice {
  return "piano";
}

export function readPieceListenVoice(): PieceListenVoice {
  return "piano";
}

export function writePieceListenVoice(voice: PieceListenVoice): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PIECE_LISTEN_VOICE_KEY, voice);
  } catch {
    /* ignore quota / private mode */
  }
}

export function pieceInstrumentIdFor(
  _voice: PieceListenVoice,
  soundfont: ListenSoundfont,
): PieceInstrumentId {
  if (soundfont === "violin") return "violin";
  return "piano";
}
