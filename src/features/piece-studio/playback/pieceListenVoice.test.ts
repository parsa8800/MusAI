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
  it("plays recorded violin for violin, and piano for piano and viola", () => {
    expect(parsePieceListenVoice(null)).toBe("piano");
    expect(parsePieceListenVoice("strings")).toBe("piano");
    writePieceListenVoice("strings");
    expect(readPieceListenVoice()).toBe("piano");
    expect(pieceInstrumentIdFor("piano", "violin")).toBe("violin");
    expect(pieceInstrumentIdFor("strings", "violin")).toBe("violin");
    expect(pieceInstrumentIdFor("piano", "piano")).toBe("piano");
    expect(pieceInstrumentIdFor("piano", "viola")).toBe("piano");
  });
});
