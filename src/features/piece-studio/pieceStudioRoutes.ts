/** App-router entry for Piece Studio. Keep this the only public path prefix. */
export const PIECE_STUDIO_HREF = "/practice/piece" as const;

export function pieceWorkspaceHref(slug: string): string {
  return `${PIECE_STUDIO_HREF}/${encodeURIComponent(slug)}`;
}

export function slugifyPieceTitle(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "piece";
}

export function uniquePieceSlug(
  base: string,
  existingSlugs: readonly string[],
): string {
  const taken = new Set(existingSlugs);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
