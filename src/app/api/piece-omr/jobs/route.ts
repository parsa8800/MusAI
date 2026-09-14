import {
  OMR_COPY,
  OmrError,
  omrUserMessage,
} from "@/features/piece-studio/omr/omrProvider";
import { isOmrJobCapable } from "@/features/piece-studio/omr/omrJob";
import {
  pieceImportFail,
  pieceImportLog,
} from "@/features/piece-studio/omr/pieceImportPipelineLog";
import {
  isOmrProviderConfigured,
  resolveOmrProvider,
} from "@/features/piece-studio/omr/resolveOmrProvider";
import {
  isSheetMusicScan,
  mimeForSheetScan,
} from "@/features/piece-studio/omr/sheetMusicScan";
import { PIECE_UPLOAD_MAX_BYTES } from "@/features/piece-studio/pieceStudioLimits";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
/** Job submit only — recognition runs on the OMR worker, not here. */
export const maxDuration = 60;

function uploadedFile(entry: FormDataEntryValue | null): {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
} | null {
  if (!entry || typeof entry === "string") return null;
  const file = entry as File;
  if (typeof file.arrayBuffer !== "function" || typeof file.size !== "number") {
    return null;
  }
  if (file.size <= 0) return null;
  return {
    name: typeof file.name === "string" ? file.name : "upload",
    type: typeof file.type === "string" ? file.type : "",
    size: file.size,
    arrayBuffer: () => file.arrayBuffer(),
  };
}

/**
 * Start an async recognition job. The browser polls
 * GET /api/piece-omr/jobs/[jobId] while showing “Reading your music…”.
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    pieceImportFail("UPLOAD", err, { where: "POST /api/piece-omr/jobs formData" });
    return NextResponse.json({ error: OMR_COPY.chooseFile }, { status: 400 });
  }
  const entry = uploadedFile(form.get("file"));
  if (!entry) {
    return NextResponse.json({ error: OMR_COPY.chooseFile }, { status: 400 });
  }
  if (entry.size > PIECE_UPLOAD_MAX_BYTES) {
    return NextResponse.json({ error: OMR_COPY.tooLarge }, { status: 413 });
  }
  if (!isSheetMusicScan(entry.name, entry.type)) {
    return NextResponse.json({ error: OMR_COPY.chooseFile }, { status: 400 });
  }

  const provider = resolveOmrProvider();
  if (!isOmrProviderConfigured() || provider.id === "unavailable") {
    pieceImportFail("OMR", "provider unavailable on job submit", {
      providerId: provider.id,
    });
    return NextResponse.json({ error: OMR_COPY.unavailable }, { status: 503 });
  }
  if (!isOmrJobCapable(provider)) {
    pieceImportFail("OMR", "provider has no job API", {
      providerId: provider.id,
    });
    return NextResponse.json(
      { error: OMR_COPY.readingNotReady },
      { status: 503 },
    );
  }

  const mime = mimeForSheetScan(entry.name, entry.type);
  pieceImportLog("PDF_RASTERISE", "skip", {
    reason: "rasterisation runs on the OMR worker when needed",
    mimeType: mime,
    isPdf: mime === "application/pdf",
  });

  try {
    const bytes = await entry.arrayBuffer();
    const { jobId } = await provider.submitJob({
      bytes,
      fileName: entry.name,
      mimeType: mime,
    });
    pieceImportLog("OMR", "ok", {
      where: "POST /api/piece-omr/jobs",
      providerId: provider.id,
      jobId,
      status: "queued",
    });
    return NextResponse.json(
      { jobId, status: "queued" as const, providerId: provider.id },
      { status: 202 },
    );
  } catch (err) {
    pieceImportFail("OMR", err, {
      where: "POST /api/piece-omr/jobs",
      providerId: provider.id,
    });
    const status =
      err instanceof OmrError && err.userMessage === OMR_COPY.unavailable
        ? 503
        : 422;
    return NextResponse.json({ error: omrUserMessage(err) }, { status });
  }
}
