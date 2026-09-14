import {
  OMR_COPY,
  OmrError,
  type OMRProvider,
  type OmrInput,
} from "@/features/piece-studio/omr/omrProvider";
import { mimeForSheetScan } from "@/features/piece-studio/omr/sheetMusicScan";

export type HttpOmrProviderOptions = {
  url: string;
  token?: string;
  fetch?: typeof fetch;
};

/**
 * Generic sidecar: POST multipart `file`, receive MusicXML text or
 * `{ musicXml: string }`. Point `MUSAI_OMR_URL` at Audiveris, oemer, etc.
 */
export function createHttpOmrProvider(
  options: HttpOmrProviderOptions,
): OMRProvider {
  const fetchImpl = options.fetch ?? fetch;
  return {
    id: "http",
    async recognize(input: OmrInput) {
      const mime = mimeForSheetScan(input.fileName, input.mimeType);
      const blob = new Blob([input.bytes], { type: mime });
      const form = new FormData();
      form.append("file", blob, input.fileName);
      const headers: Record<string, string> = {};
      if (options.token) headers.Authorization = `Bearer ${options.token}`;
      let res: Response;
      try {
        res = await fetchImpl(options.url, {
          method: "POST",
          headers,
          body: form,
        });
      } catch (err) {
        throw new OmrError(OMR_COPY.unavailable, err);
      }
      const raw = await res.text();
      if (!res.ok) {
        throw new OmrError(messageFromHttpBody(raw, res.status), raw);
      }
      const musicXml = musicXmlFromHttpBody(raw);
      if (!musicXml) {
        throw new OmrError(OMR_COPY.invalidScore);
      }
      return { musicXml };
    },
  };
}

function musicXmlFromHttpBody(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.includes("<score-partwise") || trimmed.includes("<score-timewise")) {
    return trimmed;
  }
  try {
    const parsed = JSON.parse(trimmed) as { musicXml?: unknown };
    return typeof parsed.musicXml === "string" ? parsed.musicXml : null;
  } catch {
    return null;
  }
}

function messageFromHttpBody(raw: string, status: number): string {
  try {
    const parsed = JSON.parse(raw) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error;
    }
  } catch {
    /* not JSON */
  }
  if (status === 402 || status === 503) return OMR_COPY.unavailable;
  if (status === 413) return OMR_COPY.tooLarge;
  return OMR_COPY.failed;
}
