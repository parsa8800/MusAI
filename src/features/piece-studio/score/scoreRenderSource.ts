/**
 * Opaque score interchange for notation engines.
 * MusicXML remains the reliable structured interchange even when users
 * upload PDFs/photos — OMR and digital imports both land here.
 */
export type ScoreRenderSource = {
  format: "musicxml";
  content: string;
};

/** OSMD / browsers can hang or fail when a DOCTYPE points at an external DTD. */
function stripMusicXmlDoctype(musicXml: string): string {
  return musicXml.replace(/<!DOCTYPE[^>]*>/i, "");
}

export function musicXmlRenderSource(musicXml: string): ScoreRenderSource {
  return { format: "musicxml", content: stripMusicXmlDoctype(musicXml) };
}
