/**
 * Replaceable sheet-music recognition. Piece Studio talks only to this
 * contract — never to a vendor SDK. Implementations must return MusicXML.
 */

export type OmrInput = {
  bytes: ArrayBuffer;
  fileName: string;
  mimeType: string;
};

export type OmrResult = {
  musicXml: string;
};

export type OMRProvider = {
  readonly id: string;
  /**
   * Run recognition to completion. Prefer job submit/poll for long engines
   * so the browser never waits on a single serverless request.
   */
  recognize(input: OmrInput): Promise<OmrResult>;
  /** Optional: enqueue work on a dedicated worker / remote job API. */
  submitJob?(
    input: OmrInput,
  ): Promise<import("./omrJob").OmrJobSubmitResult>;
  /** Optional: poll a previously submitted job. */
  getJob?(jobId: string): Promise<import("./omrJob").OmrJobSnapshot>;
};

/** User-facing copy only — never mention OCR/OMR/workers/npm/env vars in the UI. */
export const OMR_COPY = {
  uploading: "Reading your music",
  reading: "Reading your music",
  processing: "Reading your music",
  validating: "Checking the score",
  checking: "Checking the score",
  failed: "Couldn’t read this score",
  failedTitle: "Couldn’t read this score",
  failedLead: "",
  confirm: "Check your score",
  confirmLead: "Does this look right?",
  looksGood: "Use this score",
  tryAgain: "Try another file",
  tryAnotherImage: "Try again",
  chooseAnotherFile: "Choose another file",
  keepOriginal: "Keep original",
  remove: "Remove",
  removeConfirmTitle: "Remove this piece?",
  removeConfirmLead: "Your upload and any progress will be deleted.",
  checkSection: "Check this section",
  originalLabel: "Original",
  musaiScoreLabel: "Digital score",
  showOriginal: "Original",
  showDigital: "Digital score",
  statusReady: "Ready",
  statusFailed: "Couldn’t read this score",
  emptyPreview: "No preview",
  preparingScore: "Preparing score",
  openingScore: "Opening your score",
  readingPatience: "Photos and PDFs can take a little longer.",
  displayFailed: "Couldn’t display this score",
  displayFailedTitle: "Couldn’t display this score",
  unavailable:
    "We couldn’t read the notes from this page yet. Try again with a clearer photo, or try another file.",
  /** Subtle status when PDF/image scanning isn’t available (digital scores still work). */
  scanningUnavailable:
    "Photos and PDFs can’t be scanned right now — digital scores still work",
  /** @deprecated Alias of {@link OMR_COPY.scanningUnavailable} — keep for API/protocol matches. */
  readingNotReady:
    "Photos and PDFs can’t be scanned right now — digital scores still work",
  /** @deprecated Alias of {@link OMR_COPY.scanningUnavailable}. */
  workerOffline:
    "Photos and PDFs can’t be scanned right now — digital scores still work",
  /** @deprecated Alias of {@link OMR_COPY.scanningUnavailable}. */
  workerNeedsAudiveris:
    "Photos and PDFs can’t be scanned right now — digital scores still work",
  noMusic: "We couldn’t find music on that page.",
  unreadableFile: "That file couldn’t be opened.",
  unsupported: "That page isn’t a kind of music we can read yet.",
  lockedPdf: "That PDF is locked, so we couldn’t open it.",
  tooLarge: "That file is too large to read.",
  timeout: "Reading took too long. Try a clearer page.",
  invalidScore: "Couldn’t read this score",
  digitalInvalid: "Couldn’t read this score",
  chooseFile: "Choose a photo, PDF, or digital score.",
  chooseDigital: "Choose a photo, PDF, or digital score.",
  uploadSheet: "Upload sheet music",
  advancedDigital: "Digital score",
  dropMusic: "Drop your music here",
  dropFormats: "PDF, image or digital score",
  importMusic: "Import music",
} as const;

const USER_SAFE_MESSAGES = new Set<string>(Object.values(OMR_COPY));

export class OmrError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string, cause?: unknown) {
    super(userMessage);
    this.name = "OmrError";
    this.userMessage = userMessage;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

/** Map errors to safe UI copy — never forward raw parser/stack/dev messages. */
export function omrUserMessage(err: unknown): string {
  if (err instanceof OmrError) {
    return USER_SAFE_MESSAGES.has(err.userMessage)
      ? err.userMessage
      : OMR_COPY.failed;
  }
  if (err instanceof Error && USER_SAFE_MESSAGES.has(err.message.trim())) {
    return err.message.trim();
  }
  return OMR_COPY.failed;
}
