import { afterEach, describe, expect, it } from "vitest";
import {
  PIECE_LISTEN_VOICE_KEY,
  parsePieceListenVoice,
  pieceInstrumentIdFor,
  readPieceListenVoice,
  writePieceListenVoice,
} from "@/features/piece-studio/playback/pieceListenVoice";

afterEach(() => {
  window.localStorage.removeItem(PIECE_LISTEN_VOICE_KEY);
});

describe("piece listen voice", () => {
  it("always plays piano, including a saved string choice", () => {
    expect(parsePieceListenVoice(null)).toBe("piano");
    expect(parsePieceListenVoice("strings")).toBe("piano");
    writePieceListenVoice("strings");
    expect(readPieceListenVoice()).toBe("piano");
    expect(pieceInstrumentIdFor("strings", "violin")).toBe("piano");
    expect(pieceInstrumentIdFor("strings", "viola")).toBe("piano");
  });
});
