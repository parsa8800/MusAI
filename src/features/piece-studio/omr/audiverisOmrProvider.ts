import {
  OMR_COPY,
  OmrError,
  type OMRProvider,
  type OmrInput,
  type OmrResult,
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
import { mimeForSheetScan } from "@/features/piece-studio/omr/sheetMusicScan";

export type AudiverisOmrProviderOptions = {
  /** Base URL of the Audiveris OMR worker, e.g. http://127.0.0.1:8090 */
  baseUrl: string;
  token?: string;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  maxWaitMs?: number;
};

/**
 * Piece Studio adapter for a dedicated Audiveris worker.
 * Audiveris / Java never runs in this process — only HTTP job traffic.
 */
export function createAudiverisOmrProvider(
  options: AudiverisOmrProviderOptions,
): OMRProvider {
  const fetchImpl = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/$/, "");
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const pollIntervalMs = options.pollIntervalMs ?? OMR_JOB_DEFAULT_POLL_MS;
  const maxWaitMs = options.maxWaitMs ?? OMR_JOB_DEFAULT_MAX_WAIT_MS;

  function authHeaders(): Record<string, string> {
    if (!options.token) return {};
    return { Authorization: `Bearer ${options.token}` };
  }

  async function submitJob(input: OmrInput): Promise<OmrJobSubmitResult> {
    const mime = mimeForSheetScan(input.fileName, input.mimeType);
    pieceImportLog("OMR", "start", {
      providerId: "audiveris",
      step: "submitJob",
      fileName: input.fileName,
      mimeType: mime,
      bytes: input.bytes.byteLength,
      worker: base,
    });
    const blob = new Blob([input.bytes], { type: mime });
    const form = new FormData();
    form.append("file", blob, input.fileName);
    let res: Response;
    try {
      res = await fetchImpl(`${base}/v1/jobs`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
    } catch (err) {
      pieceImportFail("OMR", err, {
        providerId: "audiveris",
        step: "submitJob fetch",
        worker: base,
      });
      throw new OmrError(OMR_COPY.unavailable, err);
    }
    const raw = await res.text();
    if (!res.ok) {
      pieceImportFail("OMR", "worker rejected submit", {
        providerId: "audiveris",
        status: res.status,
        bodyPreview: raw.slice(0, 200),
      });
      throw new OmrError(messageFromWorkerBody(raw, res.status), raw);
    }
    let parsed: { jobId?: unknown; id?: unknown } = {};
    try {
      parsed = JSON.parse(raw) as { jobId?: unknown; id?: unknown };
    } catch {
      throw new OmrError(OMR_COPY.unavailable, raw);
    }
    const jobId =
      (typeof parsed.jobId === "string" && parsed.jobId) ||
      (typeof parsed.id === "string" && parsed.id) ||
      "";
    if (!jobId) {
      throw new OmrError(OMR_COPY.unavailable, parsed);
    }
    pieceImportLog("OMR", "ok", {
      providerId: "audiveris",
      step: "submitJob",
      jobId,
    });
    return { jobId };
  }

  async function getJob(jobId: string): Promise<OmrJobSnapshot> {
    let res: Response;
    try {
      res = await fetchImpl(`${base}/v1/jobs/${encodeURIComponent(jobId)}`, {
        headers: authHeaders(),
      });
    } catch (err) {
      pieceImportFail("OMR", err, {
        providerId: "audiveris",
        step: "getJob fetch",
        jobId,
      });
      throw new OmrError(OMR_COPY.unavailable, err);
    }
    const raw = await res.text();
    if (res.status === 404) {
      return {
        id: jobId,
        status: "failed",
        error: OMR_COPY.failed,
      };
    }
    if (!res.ok) {
      throw new OmrError(messageFromWorkerBody(raw, res.status), raw);
    }
    let parsed: {
      id?: unknown;
      status?: unknown;
      musicXml?: unknown;
      error?: unknown;
    } = {};
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      throw new OmrError(OMR_COPY.unavailable, raw);
    }
    const status = normalizeStatus(parsed.status);
    const musicXml =
      typeof parsed.musicXml === "string" ? parsed.musicXml : undefined;
    const error =
      typeof parsed.error === "string" && parsed.error.trim()
        ? parsed.error
        : status === "failed"
          ? OMR_COPY.failed
          : undefined;
    return {
      id: typeof parsed.id === "string" ? parsed.id : jobId,
      status,
      musicXml,
      error,
    };
  }

  async function recognize(input: OmrInput): Promise<OmrResult> {
    const { jobId } = await submitJob(input);
    const deadline = now() + maxWaitMs;
    while (now() < deadline) {
      const snap = await getJob(jobId);
      if (snap.status === "completed") {
        if (!snap.musicXml?.trim()) {
          pieceImportFail("MUSICXML_EXPORT", "completed job missing musicXml", {
            providerId: "audiveris",
            jobId,
          });
          throw new OmrError(OMR_COPY.invalidScore);
        }
        pieceImportLog("MUSICXML_EXPORT", "ok", {
          providerId: "audiveris",
          jobId,
          chars: snap.musicXml.length,
        });
        return { musicXml: snap.musicXml };
      }
      if (snap.status === "failed") {
        throw new OmrError(snap.error || OMR_COPY.failed);
      }
      await sleep(pollIntervalMs);
    }
    pieceImportFail("OMR", "job timed out", {
      providerId: "audiveris",
      jobId,
      maxWaitMs,
    });
    throw new OmrError(OMR_COPY.timeout);
  }

  return {
    id: "audiveris",
    recognize,
    submitJob,
    getJob,
  };
}

function normalizeStatus(raw: unknown): OmrJobSnapshot["status"] {
  const s = typeof raw === "string" ? raw.toLowerCase() : "";
  if (s === "queued" || s === "pending") return "queued";
  if (s === "processing" || s === "running") return "processing";
  if (s === "completed" || s === "done" || s === "succeeded") return "completed";
  if (s === "failed" || s === "error" || s === "canceled" || s === "cancelled") {
    return "failed";
  }
  return "processing";
}

function messageFromWorkerBody(raw: string, status: number): string {
  try {
    const parsed = JSON.parse(raw) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error;
    }
  } catch {
    /* not JSON */
  }
  if (status === 503 || status === 502) return OMR_COPY.unavailable;
  if (status === 413) return OMR_COPY.tooLarge;
  if (status === 408 || status === 504) return OMR_COPY.timeout;
  return OMR_COPY.failed;
}
