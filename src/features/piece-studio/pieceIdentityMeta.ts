import type { PieceWorkspaceV1 } from "@/features/piece-studio/pieceStudioTypes";

/** Compact single meta line: Composer · key · time · tempo. */
export function pieceIdentityMeta(piece: PieceWorkspaceV1): string {
  return pieceIdentityLines(piece).metaLine ?? "";
}

/**
 * Calm hierarchy above the score:
 * Title
 * Composer · C major · 4/4 · 80 bpm
 */
export function pieceIdentityLines(piece: PieceWorkspaceV1): {
  title: string;
  /** One muted line under the title — empty when nothing to show. */
  metaLine: string | null;
  /** @deprecated Prefer metaLine. */
  composerLine: string | null;
  /** @deprecated Prefer metaLine. */
  musicLine: string | null;
} {
  const composer = piece.composer?.trim() || null;
  const bits: string[] = [];
  if (piece.score.keySignature) bits.push(piece.score.keySignature);
  if (piece.score.timeSignature) bits.push(piece.score.timeSignature);
  if (piece.score.tempoBpm) bits.push(`${piece.score.tempoBpm} bpm`);
  const musicLine = bits.length > 0 ? bits.join(" · ") : null;
  const metaLine = [composer, musicLine].filter(Boolean).join(" · ") || null;
  return {
    title: piece.title,
    metaLine,
    composerLine: composer,
    musicLine,
  };
}
