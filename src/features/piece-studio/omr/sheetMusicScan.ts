const SCAN_EXT = /\.(pdf|png|jpe?g)$/i;

export function isSheetMusicScan(fileName: string, mimeType = ""): boolean {
  const name = fileName.toLowerCase();
  const mime = mimeType.toLowerCase();
  if (name.endsWith(".pdf") || mime === "application/pdf") return true;
  if (name.endsWith(".png") || mime === "image/png") return true;
  if (
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    mime === "image/jpeg" ||
    mime === "image/jpg"
  ) {
    return true;
  }
  return SCAN_EXT.test(name);
}

export function mimeForSheetScan(fileName: string, mimeType = ""): string {
  const mime = mimeType.toLowerCase().trim();
  if (mime === "application/pdf" || mime === "image/png" || mime === "image/jpeg") {
    return mime;
  }
  const name = fileName.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return mimeType || "application/octet-stream";
}
