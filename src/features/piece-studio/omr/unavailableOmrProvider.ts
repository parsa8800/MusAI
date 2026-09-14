import {
  OMR_COPY,
  OmrError,
  type OMRProvider,
} from "@/features/piece-studio/omr/omrProvider";
import { pieceImportFail } from "@/features/piece-studio/omr/pieceImportPipelineLog";

export function createUnavailableOmrProvider(): OMRProvider {
  return {
    id: "unavailable",
    async recognize() {
      pieceImportFail("OMR", "UnavailableOmrProvider — no backend configured", {
        providerId: "unavailable",
        hint: "Set MUSAI_OMR_PROVIDER=audiveris (local worker), MUSAI_FLAT_API_TOKEN, or MUSAI_OMR_URL",
      });
      throw new OmrError(OMR_COPY.unavailable);
    },
  };
}
