import {
  listPieceWorkspaces,
  removePieceWorkspace,
  getPieceWorkspaceById,
  upsertPieceWorkspace,
} from "@/features/piece-studio/pieceStudioCatalog";
import {
  readPieceRecognizedMusicXml,
  readPieceStructuredScore,
  removePieceOriginalFile,
  savePieceOriginalFile,
  savePieceRecognizedMusicXml,
  savePieceStructuredScore,
} from "@/features/piece-studio/pieceStudioFiles";
import { PIECE_UPLOAD_MAX_BYTES } from "@/features/piece-studio/pieceStudioLimits";
import {
  pieceWorkspaceHref,
  slugifyPieceTitle,
  uniquePieceSlug,
} from "@/features/piece-studio/pieceStudioRoutes";
import {
  digitalScoreFromMusai,
  sourceKindFromFile,
  titleFromFileName,
} from "@/features/piece-studio/pieceStudioScore";
import { assessRecognition } from "@/features/piece-studio/omr/assessRecognitionHints";
import {
  pieceImportFail,
  pieceImportLog,
} from "@/features/piece-studio/omr/pieceImportPipelineLog";
import { recognizeSheetMusic } from "@/features/piece-studio/omr/recognizeSheetMusic";
import { isSheetMusicScan } from "@/features/piece-studio/omr/sheetMusicScan";
import { omrUserMessage, OMR_COPY } from "@/features/piece-studio/omr/omrProvider";
import { validateRecognizedMusicXml } from "@/features/piece-studio/omr/validateRecognizedMusicXml";
import { importDigitalScoreFromFile } from "@/features/piece-studio/pieceStudioDigitalImport";
import { isMusicXmlInterchangeFile } from "@/features/piece-studio/score/musicXmlSource";
import { PIECE_STUDIO_SCHEMA_VERSION } from "@/features/piece-studio/pieceStudioTypes";
import type {
  PieceRecognitionHint,
  PieceSourceKind,
  PieceWorkspaceV1,
} from "@/features/piece-studio/pieceStudioTypes";
import type { MusaiScoreV1 } from "@/features/piece-studio/score/musaiScore";

export { PIECE_UPLOAD_MAX_BYTES };

/** Unified Piece Studio import — all supported sheet + digital formats. */
export const PIECE_STUDIO_UPLOAD_ACCEPT = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".musicxml",
  ".xml",
  ".mxl",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.recordare.musicxml",
  "application/vnd.recordare.musicxml+xml",
  "application/xml",
  "text/xml",
].join(",");

/** @deprecated Use {@link PIECE_STUDIO_UPLOAD_ACCEPT}. */
export const PIECE_SHEET_UPLOAD_ACCEPT = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  "application/pdf",
  "image/png",
  "image/jpeg",
].join(",");

/** @deprecated Use {@link PIECE_STUDIO_UPLOAD_ACCEPT}. */
export const PIECE_DIGITAL_UPLOAD_ACCEPT = [
  ".musicxml",
  ".xml",
  ".mxl",
  "application/vnd.recordare.musicxml",
  "application/vnd.recordare.musicxml+xml",
  "application/xml",
  "text/xml",
].join(",");

/** @deprecated Prefer {@link PIECE_STUDIO_UPLOAD_ACCEPT}. */
export const PIECE_UPLOAD_ACCEPT = PIECE_STUDIO_UPLOAD_ACCEPT;

export type ImportPiecePhase = "uploading" | "processing" | "validating";

export type ImportPieceDeps = {
  recognizeSheet?: (file: File) => Promise<string>;
  onPhase?: (phase: ImportPiecePhase) => void;
};

/**
 * Temporary import — not a catalog piece. Holds the upload + recognition
 * result until the student confirms a usable digital score.
 */
export type PieceImportDraft = {
  sessionId: string;
  file: File;
  sourceKind: PieceSourceKind;
  sourceFileName: string;
  sourceMimeType: string;
  title: string;
  composer: string | null;
  recognitionStatus: "ready" | "failed";
  recognitionMessage: string | null;
  musicXml: string | null;
  structured: MusaiScoreV1 | null;
  recognitionHints: PieceRecognitionHint[];
  recognitionFocusMeasure: number | null;
  /** Legacy catalog row awaiting confirm (pre-lifecycle-fix orphans). */
  existingPieceId?: string;
  /** Set after a successful commit — prevents duplicate permanent pieces. */
  committedPieceId?: string;
};

export type PieceImportResult =
  | { status: "committed"; piece: PieceWorkspaceV1 }
  | { status: "ready"; draft: PieceImportDraft }
  | { status: "failed"; draft: PieceImportDraft };

function newSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `import-${crypto.randomUUID()}`;
  }
  return `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function newPieceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `piece-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function persistPermanentPiece(args: {
  file: File;
  musicXml: string;
  structured: MusaiScoreV1;
  sourceKind: PieceSourceKind;
  recognitionHints?: PieceRecognitionHint[];
  recognitionFocusMeasure?: number | null;
  now?: Date;
}): Promise<PieceWorkspaceV1> {
  const now = args.now ?? new Date();
  const score = digitalScoreFromMusai(args.structured);
  const existing = listPieceWorkspaces();
  const slug = uniquePieceSlug(
    slugifyPieceTitle(score.title),
    existing.map((p) => p.slug),
  );
  const iso = now.toISOString();
  const piece: PieceWorkspaceV1 = {
    schemaVersion: PIECE_STUDIO_SCHEMA_VERSION,
    pieceId: newPieceId(),
    slug,
    title: score.title,
    composer: score.composer,
    sourceKind: args.sourceKind,
    sourceFileName: args.file.name,
    sourceMimeType: args.file.type || "application/octet-stream",
    importedAt: iso,
    lastOpenedAt: iso,
    lastView: "score",
    score,
    attempts: [],
    progressPercent: 0,
    personalBestScore: null,
    lifetimeAttemptCount: 0,
    lastPractisedAt: null,
    hasOriginalFile: true,
    recognitionStatus: args.sourceKind === "musicxml" ? "none" : "ready",
    recognitionMessage: null,
    recognitionConfirmed: true,
    recognitionHints: args.recognitionHints ?? [],
    recognitionFocusMeasure: args.recognitionFocusMeasure ?? null,
  };

  await savePieceOriginalFile(piece.pieceId, args.file);
  await savePieceRecognizedMusicXml(piece.pieceId, args.musicXml);
  await savePieceStructuredScore(piece.pieceId, args.structured);

  // Fail closed if the workspace would open without engraving / playback data.
  const [savedXml, savedScore] = await Promise.all([
    readPieceRecognizedMusicXml(piece.pieceId),
    readPieceStructuredScore(piece.pieceId),
  ]);
  if (!savedXml?.trim() || !savedScore) {
    throw new Error("Couldn’t save that score. Try again.");
  }

  upsertPieceWorkspace(piece);
  pieceImportLog("SAVE", "ok", {
    where: "permanent piece after confirmed digital score",
    pieceId: piece.pieceId,
    xmlChars: savedXml.length,
    notes: savedScore.noteCount,
  });
  return piece;
}

/**
 * Upload → temporary import → recognition → validation.
 * A catalog piece is created only after {@link commitPieceImport} (or legacy
 * auto-commit is no longer used for MusicXML — digital files also preview first).
 */
export async function importPieceFromFile(
  file: File,
  now = new Date(),
  deps: ImportPieceDeps = {},
): Promise<PieceImportResult> {
  void now;
  if (file.size <= 0) {
    throw new Error(OMR_COPY.chooseFile);
  }
  if (file.size > PIECE_UPLOAD_MAX_BYTES) {
    throw new Error("Choose a file under 20 MB.");
  }
  // Extension wins over MIME so empty/odd browser types never send digital
  // scores through the OMR worker.
  const kind = isMusicXmlInterchangeFile(file.name, file.type)
    ? "musicxml"
    : sourceKindFromFile(file.name, file.type);
  deps.onPhase?.("uploading");
  pieceImportLog("UPLOAD", "start", {
    where: "importPieceFromFile",
    fileName: file.name,
    mimeType: file.type || null,
    bytes: file.size,
    sourceKind: kind,
  });

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
    sourceKind: kind,
    sourceFileName: file.name,
    sourceMimeType: file.type || "application/octet-stream",
    title: fallbackTitle,
    composer: null,
  });

  // Direct digital score — dedicated path; never touches OMR / Audiveris.
  if (kind === "musicxml") {
    return importDigitalScoreFromFile(file, deps);
  }

  if (!isSheetMusicScan(file.name, file.type)) {
    pieceImportLog("OMR", "skip", {
      reason: "not a sheet-music scan (pdf/png/jpg)",
      sourceKind: kind,
    });
    throw new Error(
      kind === "unknown" ? OMR_COPY.chooseDigital : OMR_COPY.chooseFile,
    );
  }

  deps.onPhase?.("processing");
  const recognize =
    deps.recognizeSheet ??
    ((f: File) =>
      recognizeSheetMusic(f, {
        onPhase: (phase) => deps.onPhase?.(phase),
      }));
  try {
    const recognized = await recognize(file);
    deps.onPhase?.("validating");
    pieceImportLog("PARSE", "start", {
      where: "validateRecognizedMusicXml after OMR",
    });
    const { musicXml, score: structured } = validateRecognizedMusicXml(
      recognized,
      fallbackTitle,
    );
    pieceImportLog("PARSE", "ok", {
      where: "validateRecognizedMusicXml",
      parts: structured.parts.length,
      measures: structured.parts[0]?.measures.length ?? 0,
    });
    const score = digitalScoreFromMusai(structured);
    const hints = assessRecognition(structured);
    const draft: PieceImportDraft = {
      ...baseDraft(),
      title: score.title,
      composer: score.composer,
      recognitionStatus: "ready",
      recognitionMessage: null,
      musicXml,
      structured,
      recognitionHints: hints.hints,
      recognitionFocusMeasure: hints.focusMeasureIndex,
    };
    pieceImportLog("RENDER", "ok", {
      where: "temporary import ready for review (not catalogued)",
      sessionId: draft.sessionId,
    });
    return { status: "ready", draft };
  } catch (err) {
    pieceImportFail("OMR", err, {
      where: "importPieceFromFile recognize/validate",
      sourceKind: kind,
    });
    const draft: PieceImportDraft = {
      ...baseDraft(),
      recognitionStatus: "failed",
      recognitionMessage: omrUserMessage(err) || OMR_COPY.failed,
      musicXml: null,
      structured: null,
      recognitionHints: [],
      recognitionFocusMeasure: null,
    };
    pieceImportLog("RENDER", "ok", {
      where: "temporary import failed (not catalogued)",
      sessionId: draft.sessionId,
    });
    return { status: "failed", draft };
  }
}

/**
 * Student accepted the digital score — create the permanent Piece Studio item.
 */
export async function commitPieceImport(
  draft: PieceImportDraft,
  now = new Date(),
): Promise<PieceWorkspaceV1> {
  if (draft.recognitionStatus !== "ready" || !draft.musicXml || !draft.structured) {
    throw new Error(OMR_COPY.invalidScore);
  }

  // Idempotent: a second confirm on the same draft must not invent another piece.
  if (draft.committedPieceId) {
    const already = getPieceWorkspaceById(draft.committedPieceId);
    if (already) return already;
  }

  // Legacy unconfirmed catalog row: just flip confirmed (files already saved).
  if (draft.existingPieceId) {
    const existing = listPieceWorkspaces().find(
      (p) => p.pieceId === draft.existingPieceId,
    );
    if (!existing) {
      throw new Error("That piece is no longer in your library.");
    }
    const confirmed = confirmImportedPiece(existing);
    draft.committedPieceId = confirmed.pieceId;
    return confirmed;
  }

  const piece = await persistPermanentPiece({
    file: draft.file,
    musicXml: draft.musicXml,
    structured: draft.structured,
    sourceKind: draft.sourceKind,
    recognitionHints: draft.recognitionHints,
    recognitionFocusMeasure: draft.recognitionFocusMeasure,
    now,
  });
  draft.committedPieceId = piece.pieceId;
  return piece;
}

/** Student accepted a reconstructed score already in the catalog (legacy). */
export function confirmImportedPiece(piece: PieceWorkspaceV1): PieceWorkspaceV1 {
  const next: PieceWorkspaceV1 = {
    ...piece,
    recognitionConfirmed: true,
    lastOpenedAt: new Date().toISOString(),
  };
  upsertPieceWorkspace(next);
  return next;
}

/**
 * Drop a temporary import. Safe no-op — drafts never enter the catalog.
 * Clears any legacy catalog piece if `existingPieceId` is set.
 */
export async function discardPieceImport(
  draft: PieceImportDraft | null | undefined,
): Promise<void> {
  if (!draft) return;
  if (draft.existingPieceId) {
    await removePieceOriginalFile(draft.existingPieceId);
    removePieceWorkspace(draft.existingPieceId);
  }
}

/**
 * Remove failed / unconfirmed catalog orphans from older builds that created
 * pieces before recognition succeeded.
 */
export async function purgeIncompleteImports(): Promise<number> {
  const orphans = listPieceWorkspaces().filter((piece) => {
    if (piece.recognitionConfirmed) return false;
    if (piece.recognitionStatus === "failed") return true;
    // Ready-but-unconfirmed scans are still reviewable; keep them.
    return false;
  });
  for (const piece of orphans) {
    await removePieceOriginalFile(piece.pieceId);
    removePieceWorkspace(piece.pieceId);
  }
  return orphans.length;
}

/**
 * Build a review draft from a legacy catalog piece awaiting confirmation.
 */
export async function draftFromCatalogPiece(
  piece: PieceWorkspaceV1,
  file: File | Blob,
  musicXml: string,
  structured: MusaiScoreV1,
): Promise<PieceImportDraft> {
  return {
    sessionId: `legacy-${piece.pieceId}`,
    existingPieceId: piece.pieceId,
    file: file instanceof File ? file : new File([file], piece.sourceFileName, {
      type: piece.sourceMimeType,
    }),
    sourceKind: piece.sourceKind,
    sourceFileName: piece.sourceFileName,
    sourceMimeType: piece.sourceMimeType,
    title: piece.title,
    composer: piece.composer,
    recognitionStatus: "ready",
    recognitionMessage: piece.recognitionMessage ?? null,
    musicXml,
    structured,
    recognitionHints: piece.recognitionHints ?? [],
    recognitionFocusMeasure: piece.recognitionFocusMeasure ?? null,
  };
}

/** True when a catalog piece still needs the import review gate (legacy). */
export function needsImportReview(piece: PieceWorkspaceV1): boolean {
  if (piece.sourceKind !== "pdf" && piece.sourceKind !== "image") return false;
  if (piece.recognitionConfirmed) return false;
  return piece.recognitionStatus === "ready";
}

export function hrefForImportedPiece(piece: PieceWorkspaceV1): string {
  return pieceWorkspaceHref(piece.slug);
}

export function importBusyLabel(file: File): string {
  if (isMusicXmlInterchangeFile(file.name, file.type)) {
    return OMR_COPY.checking;
  }
  return OMR_COPY.reading;
}

export function importPhaseLabel(phase: ImportPiecePhase): string {
  switch (phase) {
    case "uploading":
    case "processing":
      return OMR_COPY.reading;
    case "validating":
      return OMR_COPY.checking;
  }
}
