import type { MusaiScoreV1 } from "@/features/piece-studio/score/musaiScore";
import { musicXmlFromBytes } from "@/features/piece-studio/score/musicXmlSource";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";

const INVALID = "Couldn’t read this score";
const UNREADABLE = "That file couldn’t be opened.";

/**
 * Validate MusicXML interchange for direct digital uploads and (later) OMR exports.
 * Lives in score/ so the digital import path never depends on the OMR worker.
 */
export function validateMusicXmlInterchange(
  raw: string,
  fallbackTitle = "Untitled piece",
  fileName = "score.musicxml",
): { musicXml: string; score: MusaiScoreV1 } {
  let musicXml: string;
  try {
    musicXml = musicXmlFromBytes(new TextEncoder().encode(raw), fileName);
  } catch (err) {
    const message =
      err instanceof Error && err.message.trim() ? err.message : UNREADABLE;
    const wrapped = new Error(message);
    if (err !== undefined) (wrapped as Error & { cause?: unknown }).cause = err;
    throw wrapped;
  }
  try {
    const score = parseMusicXmlToScore(musicXml, fallbackTitle);
    if (score.parts.length === 0) {
      throw new Error(INVALID);
    }
    return { musicXml, score };
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(INVALID);
  }
}
