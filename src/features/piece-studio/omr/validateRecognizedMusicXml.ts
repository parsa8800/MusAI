import { OMR_COPY, OmrError } from "@/features/piece-studio/omr/omrProvider";
import { prepareMusicXmlForEngraving } from "@/features/piece-studio/score/prepareMusicXmlForEngraving";
import { sanitizeMusicXmlDynamics } from "@/features/piece-studio/score/sanitizeMusicXmlDynamics";
import { validateMusicXmlInterchange } from "@/features/piece-studio/score/validateMusicXml";

export { validateMusicXmlInterchange } from "@/features/piece-studio/score/validateMusicXml";

/** OMR path — same validation, wrapped in {@link OmrError} for photo/PDF copy. */
export function validateRecognizedMusicXml(
  raw: string,
  fallbackTitle = "Untitled piece",
): ReturnType<typeof validateMusicXmlInterchange> {
  try {
    // Multi-movement Audiveris merges crash OSMD until empty bars / mid
    // attributes are scrubbed — do this before dynamics cleanup.
    const engraved = prepareMusicXmlForEngraving(raw);
    const cleaned = sanitizeMusicXmlDynamics(engraved);
    return validateMusicXmlInterchange(
      cleaned,
      fallbackTitle,
      "recognized.musicxml",
    );
  } catch (err) {
    throw new OmrError(OMR_COPY.invalidScore, err);
  }
}
