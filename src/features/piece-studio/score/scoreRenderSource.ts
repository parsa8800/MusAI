/**
 * Opaque score interchange for notation engines.
 * MusicXML remains the reliable structured interchange even when users
 * upload PDFs/photos — OMR and digital imports both land here.
 */
export type ScoreRenderSource = {
  format: "musicxml";
  content: string;
};

export function musicXmlRenderSource(musicXml: string): ScoreRenderSource {
  return { format: "musicxml", content: musicXml };
}
