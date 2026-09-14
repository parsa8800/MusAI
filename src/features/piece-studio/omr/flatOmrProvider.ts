import {
  OMR_COPY,
  OmrError,
  type OMRProvider,
  type OmrInput,
} from "@/features/piece-studio/omr/omrProvider";
import type {
  OmrJobSnapshot,
  OmrJobSubmitResult,
} from "@/features/piece-studio/omr/omrJob";
import { pieceImportFail, pieceImportLog } from "@/features/piece-studio/omr/pieceImportPipelineLog";
import { mimeForSheetScan } from "@/features/piece-studio/omr/sheetMusicScan";

const DEFAULT_BASE = "https://api.flat.io/v2";
const DEFAULT_MAX_WAIT_MS = 120_000;

export type FlatOmrProviderOptions = {
  token: string;
  fetch?: typeof fetch;
  baseUrl?: string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  pollWaitSec?: number;
  maxWaitMs?: number;
};

type FlatJob = {
  id?: string;
  status?: string;
  errorCode?: string;
  errorMessage?: string;
  code?: string;
  message?: string;
  currentStep?: string;
};

/**
 * Flat.io Interactive Jobs API → MusicXML.
 * @see https://flat.io/developers/docs/api/omr/jobs
 */
export function createFlatOmrProvider(
  options: FlatOmrProviderOptions,
): OMRProvider {
  const fetchImpl = options.fetch ?? fetch;
  const base = (options.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
  const auth = { Authorization: `Bearer ${options.token}` };
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const pollWait = options.pollWaitSec ?? 25;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;

  async function json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchImpl(`${base}${path}`, {
      ...init,
      headers: {
        ...auth,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    const text = await res.text();
    let parsed: T | null = null;
    if (text.trim()) {
      try {
        parsed = JSON.parse(text) as T;
      } catch {
        parsed = null;
      }
    }
    if (!res.ok) {
      throw flatHttpError(res.status, parsed);
    }
    return (parsed ?? {}) as T;
  }

  async function createFlatJob(input: OmrInput): Promise<string> {
    const mime = mimeForSheetScan(input.fileName, input.mimeType);
    pieceImportLog("OMR", "start", {
      providerId: "flat",
      fileName: input.fileName,
      mimeType: mime,
      bytes: input.bytes.byteLength,
    });
    const file = bytesToBase64(new Uint8Array(input.bytes));
    let created: FlatJob;
    try {
      created = await json<FlatJob>("/omr/jobs", {
        method: "POST",
        body: JSON.stringify({
          output: "musicxml",
          autoStart: true,
          files: [{ file, filename: input.fileName, mimeType: mime }],
        }),
      });
    } catch (err) {
      pieceImportFail("OMR", err, {
        providerId: "flat",
        step: "create job",
      });
      throw err;
    }
    const jobId = created.id;
    if (!jobId) {
      pieceImportFail("OMR", "Flat job response missing id", {
        providerId: "flat",
        created,
      });
      throw new OmrError(OMR_COPY.unavailable);
    }
    return jobId;
  }

  async function exportMusicXml(jobId: string, done: FlatJob): Promise<string> {
    const exportRes = await fetchImpl(
      `${base}/omr/jobs/${jobId}/exports/musicxml`,
      { headers: auth },
    );
    const musicXml = await exportRes.text();
    if (
      !exportRes.ok ||
      !(
        musicXml.includes("score-partwise") ||
        musicXml.includes("score-timewise")
      )
    ) {
      pieceImportFail("MUSICXML_EXPORT", "Flat export missing MusicXML", {
        providerId: "flat",
        jobId,
        httpStatus: exportRes.status,
        bodyPreview: musicXml.slice(0, 120),
      });
      throw new OmrError(OMR_COPY.invalidScore, done);
    }
    pieceImportLog("MUSICXML_EXPORT", "ok", {
      providerId: "flat",
      jobId,
      chars: musicXml.length,
    });
    return musicXml;
  }

  async function advanceFlatJob(jobId: string): Promise<FlatJob> {
    const wait = pollWait > 0 ? `?wait=${pollWait}` : "";
    const job = await json<FlatJob>(`/omr/jobs/${jobId}${wait}`);
    if (job.status === "awaitingInput") {
      await json<FlatJob>(
        `/omr/jobs/${jobId}/steps/${job.currentStep ?? "details"}`,
        {
          method: "POST",
          body: JSON.stringify({ step: job.currentStep ?? "details" }),
        },
      );
      return json<FlatJob>(`/omr/jobs/${jobId}`);
    }
    return job;
  }

  async function submitJob(input: OmrInput): Promise<OmrJobSubmitResult> {
    const jobId = await createFlatJob(input);
    pieceImportLog("OMR", "ok", {
      providerId: "flat",
      step: "submitJob",
      jobId,
    });
    return { jobId };
  }

  async function getJob(jobId: string): Promise<OmrJobSnapshot> {
    try {
      const job = await advanceFlatJob(jobId);
      if (job.status === "done") {
        try {
          const musicXml = await exportMusicXml(jobId, job);
          void fetchImpl(`${base}/omr/jobs/${jobId}`, {
            method: "DELETE",
            headers: auth,
          }).catch(() => undefined);
          return { id: jobId, status: "completed", musicXml };
        } catch (err) {
          return {
            id: jobId,
            status: "failed",
            error:
              err instanceof OmrError ? err.userMessage : OMR_COPY.invalidScore,
          };
        }
      }
      if (job.status === "error" || job.status === "canceled") {
        return {
          id: jobId,
          status: "failed",
          error: mapFlatError(job.errorCode),
        };
      }
      return { id: jobId, status: "processing" };
    } catch (err) {
      if (err instanceof OmrError) {
        return { id: jobId, status: "failed", error: err.userMessage };
      }
      throw err;
    }
  }

  async function pollJob(jobId: string): Promise<FlatJob> {
    const deadline = now() + maxWaitMs;
    let job: FlatJob = { id: jobId, status: "processing" };
    while (now() < deadline) {
      job = await advanceFlatJob(jobId);
      if (job.status === "done") return job;
      if (job.status === "error" || job.status === "canceled") {
        throw new OmrError(mapFlatError(job.errorCode), job);
      }
      if (pollWait <= 0) await sleep(1);
    }
    throw new OmrError(OMR_COPY.timeout);
  }

  return {
    id: "flat",
    submitJob,
    getJob,
    async recognize(input: OmrInput) {
      const jobId = await createFlatJob(input);
      try {
        const done = await pollJob(jobId);
        pieceImportLog("OMR", "ok", {
          providerId: "flat",
          jobId,
          status: done.status,
        });
        const musicXml = await exportMusicXml(jobId, done);
        return { musicXml };
      } finally {
        void fetchImpl(`${base}/omr/jobs/${jobId}`, {
          method: "DELETE",
          headers: auth,
        }).catch(() => undefined);
      }
    },
  };
}

function flatHttpError(status: number, body: unknown): OmrError {
  const job = (body ?? {}) as FlatJob;
  if (status === 402) return new OmrError(OMR_COPY.unavailable, body);
  if (job.errorCode) return new OmrError(mapFlatError(job.errorCode), body);
  if (status === 413) return new OmrError(OMR_COPY.tooLarge, body);
  return new OmrError(OMR_COPY.unavailable, body);
}

function mapFlatError(code: string | undefined): string {
  switch (code) {
    case "NO_MUSIC_DETECTED":
      return OMR_COPY.noMusic;
    case "CORRUPTED_FILE":
      return OMR_COPY.unreadableFile;
    case "UNSUPPORTED_FORMAT":
    case "UNSUPPORTED_TABLATURE":
      return OMR_COPY.unsupported;
    case "ENCRYPTED_PDF":
      return OMR_COPY.lockedPdf;
    case "TOO_LARGE":
      return OMR_COPY.tooLarge;
    case "ENGINE_TIMEOUT":
      return OMR_COPY.timeout;
    default:
      return OMR_COPY.failed;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
