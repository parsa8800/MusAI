/**
 * Direct digital score import (.musicxml / .xml / .mxl).
 * Completely independent of PDF/image recognition — parse → validate → normalise only.
 */
import { digitalScoreFromMusai, titleFromFileName } from "@/features/piece-studio/pieceStudioScore";
import {
  pieceImportFail,
  pieceImportLog,
} from "@/features/piece-studio/omr/pieceImportPipelineLog";
import type {
  ImportPieceDeps,
  PieceImportDraft,
  PieceImportResult,
} from "@/features/piece-studio/pieceStudioImport";
import { musicXmlFromFile } from "@/features/piece-studio/score/musicXmlSource";
import { musicXmlPreviewLog } from "@/features/piece-studio/score/scoreViewport";
import { validateMusicXmlInterchange } from "@/features/piece-studio/score/validateMusicXml";

const FAILED = "Couldn’t read this score";

function newSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `import-${crypto.randomUUID()}`;
  }
  return `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Parse → validate → normalise → ready draft for preview.
 * Does not call sheet-music recognition or any piece-omr HTTP endpoint.
 */
export async function importDigitalScoreFromFile(
  file: File,
  deps: Pick<ImportPieceDeps, "onPhase"> = {},
): Promise<PieceImportResult> {
  const fallbackTitle = titleFromFileName(file.name);
  const baseDraft = (): Omit<
    PieceImportDraft,
    | "recognitionStatus"
    | "recognitionMessage"
    | "musicXml"
    | "structured"
    | "recognitionHints"
    | "recognitionFocusMeasure"
  > => ({
    sessionId: newSessionId(),
    file,
    sourceKind: "musicxml",
    sourceFileName: file.name,
    sourceMimeType: file.type || "application/octet-stream",
    title: fallbackTitle,
    composer: null,
  });

  deps.onPhase?.("validating");
  try {
    musicXmlPreviewLog("MUSICXML_SELECTED", {
      fileName: file.name,
      mimeType: file.type || null,
      bytes: file.size,
    });
    const xml = await musicXmlFromFile(file);
    musicXmlPreviewLog("MUSICXML_READ", {
      chars: xml.length,
      head: xml.slice(0, 48),
    });
    pieceImportLog("PARSE", "start", { where: "direct digital score upload" });
    // Already decompressed if .mxl — validate as plain MusicXML text.
    const { musicXml, score: structured } = validateMusicXmlInterchange(
      xml,
      fallbackTitle,
      "score.musicxml",
    );
    musicXmlPreviewLog("MUSICXML_VALID", {
      chars: musicXml.length,
      parts: structured.parts.length,
    });
    musicXmlPreviewLog("MUSICXML_PARSED", {
      title: structured.title,
      notes: structured.noteCount,
      measures: structured.measureCount,
    });
    pieceImportLog("PARSE", "ok", {
      where: "direct digital score upload",
      parts: structured.parts.length,
      measures: structured.parts[0]?.measures.length ?? 0,
      notes: structured.noteCount,
    });
    pieceImportLog("NORMALISE", "ok", { where: "direct digital score upload" });
    const score = digitalScoreFromMusai(structured);
    musicXmlPreviewLog("SCORE_NORMALISED", {
      title: score.title,
      hasStructuredScore: score.hasStructuredScore,
      noteCount: score.noteCount,
    });
    const draft: PieceImportDraft = {
      ...baseDraft(),
      title: score.title,
      composer: score.composer,
      recognitionStatus: "ready",
      recognitionMessage: null,
      musicXml,
      structured,
      recognitionHints: [],
      recognitionFocusMeasure: null,
    };
    pieceImportLog("RENDER", "ok", {
      where: "digital score ready for preview (not catalogued)",
      sessionId: draft.sessionId,
      musicXmlChars: musicXml.length,
    });
    return { status: "ready", draft };
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[piece-import:PARSE]", err);
    }
    pieceImportFail("PARSE", err, {
      where: "direct digital score upload",
      fileName: file.name,
    });
    return {
      status: "failed",
      draft: {
        ...baseDraft(),
        recognitionStatus: "failed",
        recognitionMessage: FAILED,
        musicXml: null,
        structured: null,
        recognitionHints: [],
        recognitionFocusMeasure: null,
      },
    };
  }
}
