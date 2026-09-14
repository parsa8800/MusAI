import {
  OMR_COPY,
  OmrError,
  type OMRProvider,
  type OmrInput,
} from "@/features/piece-studio/omr/omrProvider";
import {
  OMR_JOB_DEFAULT_MAX_WAIT_MS,
  OMR_JOB_DEFAULT_POLL_MS,
  type OmrJobSnapshot,
  type OmrJobSubmitResult,
} from "@/features/piece-studio/omr/omrJob";
import {
  pieceImportFail,
  pieceImportLog,
} from "@/features/piece-studio/omr/pieceImportPipelineLog";

/**
 * Poll a job-capable provider until MusicXML is ready.
 * Used by sync recognize() wrappers and by the client via the jobs API.
 */
export async function pollOmrJobUntilDone(
  provider: Pick<OMRProvider, "getJob">,
  jobId: string,
  options: {
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    pollIntervalMs?: number;
    maxWaitMs?: number;
  } = {},
): Promise<string> {
  if (typeof provider.getJob !== "function") {
    throw new OmrError(OMR_COPY.unavailable);
  }
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const pollIntervalMs = options.pollIntervalMs ?? OMR_JOB_DEFAULT_POLL_MS;
  const maxWaitMs = options.maxWaitMs ?? OMR_JOB_DEFAULT_MAX_WAIT_MS;
  const deadline = now() + maxWaitMs;

  while (now() < deadline) {
    const snap: OmrJobSnapshot = await provider.getJob(jobId);
    if (snap.status === "completed") {
      if (!snap.musicXml?.trim()) {
        pieceImportFail("MUSICXML_EXPORT", "completed job missing musicXml", {
          jobId,
        });
        throw new OmrError(OMR_COPY.invalidScore);
      }
      return snap.musicXml;
    }
    if (snap.status === "failed") {
      throw new OmrError(snap.error || OMR_COPY.failed);
    }
    pieceImportLog("OMR", "ok", {
      step: "poll",
      jobId,
      status: snap.status,
    });
    await sleep(pollIntervalMs);
  }
  throw new OmrError(OMR_COPY.timeout);
}

/** Convenience: submit + poll when the provider exposes jobs. */
export async function recognizeViaJobs(
  provider: OMRProvider,
  input: OmrInput,
  options?: Parameters<typeof pollOmrJobUntilDone>[2],
): Promise<string> {
  if (
    typeof provider.submitJob !== "function" ||
    typeof provider.getJob !== "function"
  ) {
    const result = await provider.recognize(input);
    return result.musicXml;
  }
  const { jobId }: OmrJobSubmitResult = await provider.submitJob(input);
  return pollOmrJobUntilDone(provider, jobId, options);
}
