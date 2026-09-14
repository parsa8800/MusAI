/**
 * Async recognition jobs — Next.js submits work to a dedicated OMR worker
 * (or Flat) and the browser polls until MusicXML is ready.
 * Heavy Java/Audiveris work never runs inside a Vercel serverless request.
 */

export type OmrJobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export type OmrJobSnapshot = {
  id: string;
  status: OmrJobStatus;
  /** Present when status === "completed". */
  musicXml?: string;
  /** User-facing message when status === "failed". */
  error?: string;
};

export type OmrJobSubmitResult = {
  jobId: string;
};

/** Providers that can run recognition without holding one long HTTP request. */
export type OMRJobCapable = {
  submitJob(input: import("./omrProvider").OmrInput): Promise<OmrJobSubmitResult>;
  getJob(jobId: string): Promise<OmrJobSnapshot>;
};

export function isOmrJobCapable(
  provider: unknown,
): provider is OMRJobCapable & { id: string } {
  return (
    typeof provider === "object" &&
    provider !== null &&
    typeof (provider as OMRJobCapable).submitJob === "function" &&
    typeof (provider as OMRJobCapable).getJob === "function"
  );
}

export const OMR_JOB_DEFAULT_MAX_WAIT_MS = 300_000;
export const OMR_JOB_DEFAULT_POLL_MS = 1_500;
