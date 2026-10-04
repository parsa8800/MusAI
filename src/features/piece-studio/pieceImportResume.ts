/**
 * The upload review lives in React state. A refresh (including the dev server
 * rebuilding the page) used to drop it. This record keeps the file and the
 * recognition job so Piece Studio can continue the same upload.
 */
import {
  readPieceOriginalFile,
  readPieceRecognizedMusicXml,
  removePieceOriginalFile,
  savePieceOriginalFile,
  savePieceRecognizedMusicXml,
} from "@/features/piece-studio/pieceStudioFiles";
import { MUSAI_PIECE_IMPORT_ACTIVE_KEY } from "@/features/piece-studio/pieceStudioStorage";
import type { PieceSourceKind } from "@/features/piece-studio/pieceStudioTypes";

const FILE_ID = MUSAI_PIECE_IMPORT_ACTIVE_KEY;

type ActiveImportStatus = "reading" | "ready" | "failed";

type ActiveImportRecord = {
  version: 1;
  sessionId: string;
  fileName: string;
  mimeType: string;
  sourceKind: PieceSourceKind;
  jobId: string | null;
  status: ActiveImportStatus;
  progress: number;
  recognitionMessage: string | null;
};

export type ActivePieceImportSnapshot = {
  sessionId: string;
  file: File;
  fileName: string;
  mimeType: string;
  sourceKind: PieceSourceKind;
  jobId: string | null;
  status: ActiveImportStatus;
  progress: number;
  musicXml: string | null;
  recognitionMessage: string | null;
};

function newSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `import-${crypto.randomUUID()}`;
  }
  return `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readRecord(): ActiveImportRecord | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(MUSAI_PIECE_IMPORT_ACTIVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveImportRecord>;
    if (parsed.version !== 1 || typeof parsed.fileName !== "string") return null;
    if (
      parsed.status !== "reading" &&
      parsed.status !== "ready" &&
      parsed.status !== "failed"
    ) {
      return null;
    }
    return {
      version: 1,
      sessionId:
        typeof parsed.sessionId === "string" && parsed.sessionId
          ? parsed.sessionId
          : newSessionId(),
      fileName: parsed.fileName,
      mimeType:
        typeof parsed.mimeType === "string" && parsed.mimeType
          ? parsed.mimeType
          : "application/octet-stream",
      sourceKind:
        parsed.sourceKind === "pdf" ||
        parsed.sourceKind === "image" ||
        parsed.sourceKind === "musicxml"
          ? parsed.sourceKind
          : "unknown",
      jobId: typeof parsed.jobId === "string" && parsed.jobId ? parsed.jobId : null,
      status: parsed.status,
      progress:
        typeof parsed.progress === "number" && Number.isFinite(parsed.progress)
          ? parsed.progress
          : 0,
      recognitionMessage:
        typeof parsed.recognitionMessage === "string"
          ? parsed.recognitionMessage
          : null,
    };
  } catch {
    return null;
  }
}

function writeRecord(record: ActiveImportRecord): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(MUSAI_PIECE_IMPORT_ACTIVE_KEY, JSON.stringify(record));
  } catch {
    /* Quota or private mode — the in-memory upload still works. */
  }
}

export async function beginActivePieceImport(
  file: File,
  sourceKind: PieceSourceKind,
): Promise<void> {
  writeRecord({
    version: 1,
    sessionId: newSessionId(),
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    sourceKind,
    jobId: null,
    status: "reading",
    progress: 4,
    recognitionMessage: null,
  });
  try {
    await savePieceOriginalFile(FILE_ID, file);
  } catch {
    /* IndexedDB can fail; session record still lets us explain a refresh. */
  }
}

export function rememberActivePieceImportJob(jobId: string): void {
  const record = readRecord();
  if (!record) return;
  record.jobId = jobId;
  record.status = "reading";
  writeRecord(record);
}

export function touchActivePieceImportProgress(percent: number): void {
  const record = readRecord();
  if (!record || record.status !== "reading") return;
  const next = Math.max(record.progress, Math.round(percent));
  if (next === record.progress) return;
  record.progress = next;
  writeRecord(record);
}

export async function rememberActivePieceImportResult(args: {
  sessionId: string;
  file: File;
  sourceKind: PieceSourceKind;
  status: "ready" | "failed";
  musicXml: string | null;
  recognitionMessage: string | null;
}): Promise<void> {
  const existing = readRecord();
  writeRecord({
    version: 1,
    sessionId: args.sessionId,
    fileName: args.file.name,
    mimeType: args.file.type || existing?.mimeType || "application/octet-stream",
    sourceKind: args.sourceKind,
    jobId: existing?.jobId ?? null,
    status: args.status,
    progress: args.status === "ready" ? 100 : (existing?.progress ?? 0),
    recognitionMessage: args.recognitionMessage,
  });
  try {
    await savePieceOriginalFile(FILE_ID, args.file);
    if (args.musicXml) {
      await savePieceRecognizedMusicXml(FILE_ID, args.musicXml);
    }
  } catch {
    /* The review is on screen; a refresh may need the file again. */
  }
}

export async function clearActivePieceImport(): Promise<void> {
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.removeItem(MUSAI_PIECE_IMPORT_ACTIVE_KEY);
    } catch {
      /* ignore */
    }
  }
  try {
    await removePieceOriginalFile(FILE_ID);
  } catch {
    /* ignore */
  }
}

export async function readActivePieceImport(): Promise<ActivePieceImportSnapshot | null> {
  const record = readRecord();
  if (!record) return null;
  const blob = await readPieceOriginalFile(FILE_ID);
  if (!blob) return null;
  const file =
    blob instanceof File
      ? blob
      : new File([blob], record.fileName, { type: record.mimeType });
  const musicXml =
    record.status === "ready" ? await readPieceRecognizedMusicXml(FILE_ID) : null;
  return {
    sessionId: record.sessionId,
    file,
    fileName: record.fileName,
    mimeType: record.mimeType,
    sourceKind: record.sourceKind,
    jobId: record.jobId,
    status: record.status,
    progress: record.progress,
    musicXml,
    recognitionMessage: record.recognitionMessage,
  };
}
