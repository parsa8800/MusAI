/**
 * Lightweight MusicXML shape check for Node/API routes where {@link DOMParser}
 * is unavailable. Full parse still runs in the browser after the job returns.
 */
export function musicXmlLooksReadable(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  const hasRoot =
    s.includes("<score-partwise") || s.includes("<score-timewise");
  // Audiveris / MusicXML partwise bodies use <part id="…">
  const hasPart = /<part(\s|>)/i.test(s);
  return hasRoot && hasPart;
}
