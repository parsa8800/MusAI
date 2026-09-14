import type {
  PieceDigitalScoreV1,
  PieceSourceKind,
} from "@/features/piece-studio/pieceStudioTypes";
import { PIECE_STUDIO_SCHEMA_VERSION } from "@/features/piece-studio/pieceStudioTypes";
import type { MusaiScoreV1 } from "@/features/piece-studio/score/musaiScore";
import { isMusicXmlInterchangeFile } from "@/features/piece-studio/score/musicXmlSource";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";

export function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
  const spaced = base.replace(/[-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!spaced) return "Untitled piece";
  if (spaced !== spaced.toLowerCase()) return spaced;
  return spaced.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/**
 * Classify an upload. Extension wins over MIME — browsers often report
 * empty or generic types for .musicxml / .xml / .mxl.
 */
export function sourceKindFromFile(
  fileName: string,
  mimeType: string,
): PieceSourceKind {
  const name = fileName.toLowerCase();
  const mime = mimeType.toLowerCase();
  // Extension-first digital scores (never route these through OMR).
  if (isMusicXmlInterchangeFile(fileName, mimeType)) {
    return "musicxml";
  }
  if (name.endsWith(".mid") || name.endsWith(".midi") || mime.includes("midi")) {
    return "midi";
  }
  if (name.endsWith(".pdf") || mime.includes("pdf")) return "pdf";
  if (
    mime.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif)$/.test(name)
  ) {
    return "image";
  }
  if (
    mime.startsWith("audio/") ||
    /\.(mp3|wav|m4a|ogg|aac|flac)$/.test(name)
  ) {
    return "audio";
  }
  return "unknown";
}

export function emptyDigitalScore(
  format: PieceSourceKind,
  title: string,
): PieceDigitalScoreV1 {
  return {
    schemaVersion: PIECE_STUDIO_SCHEMA_VERSION,
    format,
    title,
    composer: null,
    keySignature: null,
    timeSignature: null,
    tempoBpm: null,
    measureCount: null,
    hasStructuredScore: false,
    noteCount: null,
    restCount: null,
  };
}

export function digitalScoreFromMusai(score: MusaiScoreV1): PieceDigitalScoreV1 {
  return {
    schemaVersion: PIECE_STUDIO_SCHEMA_VERSION,
    format: "musicxml",
    title: score.title,
    composer: score.composer,
    keySignature: score.keySignature,
    timeSignature: score.timeSignature,
    tempoBpm: score.tempoBpm,
    measureCount: score.measureCount > 0 ? score.measureCount : null,
    hasStructuredScore: score.parts.length > 0,
    noteCount: score.noteCount,
    restCount: score.restCount,
  };
}

export function parseMusicXmlScore(
  xml: string,
  fallbackTitle: string,
): PieceDigitalScoreV1 {
  try {
    return digitalScoreFromMusai(parseMusicXmlToScore(xml, fallbackTitle));
  } catch {
    return emptyDigitalScore("musicxml", fallbackTitle);
  }
}

export function digitalScoreFromImport(input: {
  kind: PieceSourceKind;
  fileName: string;
  text?: string;
}): PieceDigitalScoreV1 {
  const title = titleFromFileName(input.fileName);
  if (input.kind === "musicxml" && input.text) {
    return parseMusicXmlScore(input.text, title);
  }
  return emptyDigitalScore(input.kind, title);
}
