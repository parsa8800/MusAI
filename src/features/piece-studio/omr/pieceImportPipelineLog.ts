/**
 * Dev-only stage logging for Piece Studio sheet-music import.
 * Never surfaces OMR/vendor jargon in the UI — console only.
 */

export const PIECE_IMPORT_STAGES = [
  "UPLOAD",
  "PDF_RASTERISE",
  "OMR",
  "MUSICXML_EXPORT",
  "PARSE",
  "NORMALISE",
  "SAVE",
  "RENDER",
] as const;

export type PieceImportStage = (typeof PIECE_IMPORT_STAGES)[number];

function loggingEnabled(): boolean {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
    return true;
  }
  if (typeof process !== "undefined" && process.env.MUSAI_PIECE_IMPORT_LOG === "1") {
    return true;
  }
  return false;
}

function prefix(stage: PieceImportStage, outcome: string): string {
  return `[piece-import:${stage}:${outcome}]`;
}

export function pieceImportLog(
  stage: PieceImportStage,
  outcome: "start" | "ok" | "skip" | "fail",
  detail?: Record<string, unknown>,
): void {
  if (!loggingEnabled()) return;
  const label = prefix(stage, outcome);
  if (outcome === "fail") {
    console.error(label, detail ?? {});
    return;
  }
  console.info(label, detail ?? {});
}

export function pieceImportFail(
  stage: PieceImportStage,
  err: unknown,
  detail?: Record<string, unknown>,
): void {
  if (!loggingEnabled()) return;
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "unknown error";
  const cause =
    err instanceof Error && "cause" in err
      ? (err as Error & { cause?: unknown }).cause
      : undefined;
  console.error(prefix(stage, "fail"), {
    ...detail,
    message,
    cause,
    stack: err instanceof Error ? err.stack : undefined,
  });
}
