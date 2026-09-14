import { OMR_COPY, OmrError } from "@/features/piece-studio/omr/omrProvider";
import { validateMusicXmlInterchange } from "@/features/piece-studio/score/validateMusicXml";

export { validateMusicXmlInterchange } from "@/features/piece-studio/score/validateMusicXml";

/** OMR path — same validation, wrapped in {@link OmrError} for photo/PDF copy. */
export function validateRecognizedMusicXml(
  raw: string,
  fallbackTitle = "Untitled piece",
): ReturnType<typeof validateMusicXmlInterchange> {
  try {
    return validateMusicXmlInterchange(raw, fallbackTitle, "recognized.musicxml");
  } catch (err) {
    throw new OmrError(OMR_COPY.invalidScore, err);
  }
}
