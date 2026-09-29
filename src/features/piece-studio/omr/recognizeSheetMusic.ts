import { OMR_COPY } from "@/features/piece-studio/omr/omrProvider";
import {
  OMR_JOB_DEFAULT_MAX_WAIT_MS,
  OMR_JOB_DEFAULT_POLL_MS,
} from "@/features/piece-studio/omr/omrJob";
import {
  pieceImportFail,
  pieceImportLog,
} from "@/features/piece-studio/omr/pieceImportPipelineLog";

export type RecognizeSheetPhase = "uploading" | "processing";

export type RecognizeSheetMusicOptions = {
  onPhase?: (phase: RecognizeSheetPhase) => void;
  /** 0–100 for the whole file → MusicXML conversion. Only moves forward. */
  onProgress?: (percent: number) => void;
};

/**
 * Worker progress is recognition only. Keep the last stretch for checking
 * the score and opening it to practise.
 */
export function pieceUploadPercentFromJob(jobPercent: number): number {
  const clamped = Math.max(0, Math.min(100, jobPercent));
  return Math.round(8 + clamped * 0.84);
}

/**
 * Browser entry: submit a recognition job, then poll until MusicXML is ready.
 * Falls back to a single POST when the backend has no job API (legacy HTTP).
 * Never blocks on Audiveris inside the Next.js process — the worker does that.
 */
export async function recognizeSheetMusic(
  file: File,
  options: RecognizeSheetMusicOptions = {},
): Promise<string> {
  options.onPhase?.("uploading");
  options.onProgress?.(6);
  pieceImportLog("UPLOAD", "start", {
    where: "client→/api/piece-omr/jobs",
    fileName: file.name,
    mimeType: file.type || null,
    bytes: file.size,
  });

  const form = new FormData();
  form.append("file", file);

  let submitRes: Response;
  try {
    submitRes = await fetch("/api/piece-omr/jobs", {
      method: "POST",
      body: form,
    });
  } catch (err) {
    pieceImportFail("UPLOAD", err, { where: "client fetch /api/piece-omr/jobs" });
    throw new Error(OMR_COPY.unavailable);
  }

  if (submitRes.status === 202) {
    let data: { jobId?: unknown; error?: unknown } = {};
    try {
      data = (await submitRes.json()) as typeof data;
    } catch (err) {
      pieceImportFail("OMR", err, { where: "client parse job submit JSON" });
      throw new Error(OMR_COPY.failed);
    }
    const jobId = typeof data.jobId === "string" ? data.jobId : "";
    if (!jobId) {
      throw new Error(OMR_COPY.failed);
    }
    pieceImportLog("UPLOAD", "ok", {
      where: "client←job accepted",
      jobId,
      status: submitRes.status,
    });
    options.onPhase?.("processing");
    options.onProgress?.(12);
    return pollRecognitionJob(jobId, (percent) =>
      options.onProgress?.(pieceUploadPercentFromJob(percent)),
    );
  }

  // Job API unavailable for this provider — try legacy sync recognize.
  if (submitRes.status === 503) {
    let syncFallback = false;
    try {
      const body = (await submitRes.clone().json()) as { error?: unknown };
      syncFallback =
        typeof body.error === "string" &&
        body.error === OMR_COPY.readingNotReady;
    } catch {
      syncFallback = false;
    }
    if (syncFallback) {
      pieceImportLog("OMR", "ok", {
        where: "client falling back to sync POST /api/piece-omr",
      });
      options.onPhase?.("processing");
      return recognizeSheetMusicSync(file);
    }
  }

  let errBody: { error?: unknown } = {};
  try {
    errBody = (await submitRes.json()) as typeof errBody;
  } catch {
    errBody = {};
  }
  const error =
    typeof errBody.error === "string" && errBody.error.trim()
      ? errBody.error
      : submitRes.status === 503
        ? OMR_COPY.unavailable
        : OMR_COPY.failed;
  pieceImportFail("OMR", error, {
    where: "client job submit failed",
    status: submitRes.status,
  });
  throw new Error(error);
}

async function recognizeSheetMusicSync(file: File): Promise<string> {
  pieceImportLog("UPLOAD", "start", {
    where: "client→/api/piece-omr (sync)",
    fileName: file.name,
  });
  const form = new FormData();
  form.append("file", file);
  let res: Response;
  try {
    res = await fetch("/api/piece-omr", { method: "POST", body: form });
  } catch (err) {
    pieceImportFail("UPLOAD", err, { where: "client fetch /api/piece-omr" });
    throw new Error(OMR_COPY.unavailable);
  }
  let data: { musicXml?: unknown; error?: unknown } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    data = {};
  }
  if (typeof data.musicXml === "string" && data.musicXml.trim()) {
    pieceImportLog("MUSICXML_EXPORT", "ok", {
      where: "client sync musicXml",
      chars: data.musicXml.length,
    });
    return data.musicXml;
  }
  throw new Error(
    typeof data.error === "string" && data.error.trim()
      ? data.error
      : OMR_COPY.failed,
  );
}

async function pollRecognitionJob(
  jobId: string,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const deadline = Date.now() + OMR_JOB_DEFAULT_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    let res: Response;
    try {
      res = await fetch(`/api/piece-omr/jobs/${encodeURIComponent(jobId)}`);
    } catch (err) {
      pieceImportFail("OMR", err, { where: "client poll job", jobId });
      throw new Error(OMR_COPY.unavailable);
    }
    let data: {
      status?: unknown;
      musicXml?: unknown;
      error?: unknown;
      progress?: unknown;
    } = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      data = {};
    }
    const status = typeof data.status === "string" ? data.status : "";
    if (typeof data.progress === "number" && Number.isFinite(data.progress)) {
      onProgress?.(data.progress);
    }
    pieceImportLog("OMR", "ok", {
      where: "client poll",
      jobId,
      status,
      httpStatus: res.status,
    });

    if (status === "completed" && typeof data.musicXml === "string") {
      pieceImportLog("MUSICXML_EXPORT", "ok", {
        where: "client job completed",
        jobId,
        chars: data.musicXml.length,
      });
      return data.musicXml;
    }
    if (status === "failed") {
      const error =
        typeof data.error === "string" && data.error.trim()
          ? data.error
          : OMR_COPY.failed;
      pieceImportFail("OMR", error, { where: "client job failed", jobId });
      throw new Error(error);
    }
    if (res.status >= 400 && status !== "queued" && status !== "processing") {
      const error =
        typeof data.error === "string" && data.error.trim()
          ? data.error
          : OMR_COPY.failed;
      throw new Error(error);
    }
    await sleep(OMR_JOB_DEFAULT_POLL_MS);
  }
  pieceImportFail("OMR", "client poll timeout", { jobId });
  throw new Error(OMR_COPY.timeout);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
