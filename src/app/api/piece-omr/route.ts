import { NextResponse } from "next/server";
import {
  OMR_COPY,
  OmrError,
  omrUserMessage,
} from "@/features/piece-studio/omr/omrProvider";
import {
  pieceImportFail,
  pieceImportLog,
} from "@/features/piece-studio/omr/pieceImportPipelineLog";
import {
  isOmrProviderConfigured,
  isOmrReadingAvailable,
  resolveOmrProvider,
} from "@/features/piece-studio/omr/resolveOmrProvider";
import {
  isSheetMusicScan,
  mimeForSheetScan,
} from "@/features/piece-studio/omr/sheetMusicScan";
import { validateRecognizedMusicXml } from "@/features/piece-studio/omr/validateRecognizedMusicXml";
import { PIECE_UPLOAD_MAX_BYTES } from "@/features/piece-studio/pieceStudioLimits";

export const runtime = "nodejs";
export const maxDuration = 120;

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

/** Feature-detect whether photo/PDF reading can run right now. */
export async function GET() {
  const status = await isOmrReadingAvailable();
  pieceImportLog("OMR", status.available ? "ok" : "skip", {
    where: "GET /api/piece-omr",
    available: status.available,
    providerId: status.providerId,
    workerReachable: status.worker?.reachable ?? null,
    audiverisConfigured: status.worker?.audiverisConfigured ?? null,
  });
  return NextResponse.json({
    available: status.available,
    message: status.message,
    providerId: status.providerId,
  });
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    pieceImportFail("UPLOAD", err, { where: "server formData()" });
    return NextResponse.json({ error: OMR_COPY.chooseFile }, { status: 400 });
  }
  const entry = uploadedFile(form.get("file"));
  if (!entry) {
    pieceImportFail("UPLOAD", "missing or empty file", {
      where: "server uploadedFile()",
    });
    return NextResponse.json({ error: OMR_COPY.chooseFile }, { status: 400 });
  }
  pieceImportLog("UPLOAD", "ok", {
    where: "server received file",
    fileName: entry.name,
    mimeType: entry.type || null,
    bytes: entry.size,
  });

  if (entry.size > PIECE_UPLOAD_MAX_BYTES) {
    pieceImportFail("UPLOAD", "file too large", {
      bytes: entry.size,
      max: PIECE_UPLOAD_MAX_BYTES,
    });
    return NextResponse.json({ error: OMR_COPY.tooLarge }, { status: 413 });
  }
  if (!isSheetMusicScan(entry.name, entry.type)) {
    pieceImportFail("UPLOAD", "not a sheet-music scan type", {
      fileName: entry.name,
      mimeType: entry.type || null,
    });
    return NextResponse.json({ error: OMR_COPY.chooseFile }, { status: 400 });
  }

  const mime = mimeForSheetScan(entry.name, entry.type);
  // Rasterisation (≈300 DPI) runs on the dedicated OMR worker, not here.
  pieceImportLog("PDF_RASTERISE", "skip", {
    reason: "rasterisation is owned by the OMR worker / engine sidecar",
    mimeType: mime,
    isPdf: mime === "application/pdf",
  });

  const provider = resolveOmrProvider();
  if (!isOmrProviderConfigured() || provider.id === "unavailable") {
    pieceImportFail("OMR", "provider unavailable / not configured", {
      providerId: provider.id,
      hasFlatToken: Boolean(
        process.env.MUSAI_FLAT_API_TOKEN?.trim() ||
          process.env.FLAT_API_TOKEN?.trim(),
      ),
      hasHttpUrl: Boolean(process.env.MUSAI_OMR_URL?.trim()),
      explicitProvider: process.env.MUSAI_OMR_PROVIDER ?? null,
    });
    return NextResponse.json(
      { error: OMR_COPY.unavailable },
      { status: 503 },
    );
  }

  try {
    pieceImportLog("OMR", "start", {
      providerId: provider.id,
      fileName: entry.name,
      mimeType: mime,
    });
    const bytes = await entry.arrayBuffer();
    const result = await provider.recognize({
      bytes,
      fileName: entry.name,
      mimeType: mime,
    });
    pieceImportLog("OMR", "ok", {
      providerId: provider.id,
      musicXmlChars: result.musicXml?.length ?? 0,
    });
    pieceImportLog("MUSICXML_EXPORT", "ok", {
      where: "provider returned musicXml",
      chars: result.musicXml.length,
    });

    pieceImportLog("PARSE", "start", { where: "validateRecognizedMusicXml" });
    const { musicXml } = validateRecognizedMusicXml(result.musicXml);
    pieceImportLog("PARSE", "ok", {
      where: "validateRecognizedMusicXml",
      chars: musicXml.length,
    });
    pieceImportLog("NORMALISE", "ok", {
      where: "validateRecognizedMusicXml (parse + MusaiScore check)",
    });

    return NextResponse.json({ musicXml });
  } catch (err) {
    const stageHint =
      err instanceof OmrError && err.userMessage === OMR_COPY.invalidScore
        ? "PARSE"
        : "OMR";
    pieceImportFail(stageHint, err, {
      providerId: provider.id,
      fileName: entry.name,
      mimeType: mime,
    });
    const status =
      err instanceof OmrError && err.userMessage === OMR_COPY.unavailable
        ? 503
        : 422;
    return NextResponse.json({ error: omrUserMessage(err) }, { status });
  }
}
