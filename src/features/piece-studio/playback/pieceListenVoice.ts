import type { ListenSoundfont } from "@/lib/instrument";
import type { PieceInstrumentId } from "@/features/piece-studio/playback/pieceInstrument";

/**
 * Listen is piano only. GM violin and viola samples are not realistic enough
 * to offer beside the grand piano, and a saved "strings" choice is ignored.
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
  _soundfont: ListenSoundfont,
): PieceInstrumentId {
  return "piano";
}
