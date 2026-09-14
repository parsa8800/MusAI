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
import { validateRecognizedMusicXml } from "@/features/piece-studio/omr/validateRecognizedMusicXml";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
/** Single poll hop to the worker / Flat — keep short. */
export const maxDuration = 60;

type RouteContext = { params: Promise<{ jobId: string }> };

/**
 * Poll recognition job status. Returns MusicXML only when completed.
 * Does not run Audiveris locally.
 */
export async function GET(_req: Request, context: RouteContext) {
  const { jobId: rawId } = await context.params;
  const jobId = decodeURIComponent(rawId || "").trim();
  if (!jobId) {
    return NextResponse.json({ error: OMR_COPY.failed }, { status: 400 });
  }

  const provider = resolveOmrProvider();
  if (!isOmrProviderConfigured() || !isOmrJobCapable(provider)) {
    return NextResponse.json({ error: OMR_COPY.unavailable }, { status: 503 });
  }

  try {
    const snap = await provider.getJob(jobId);
    pieceImportLog("OMR", "ok", {
      where: "GET /api/piece-omr/jobs/[jobId]",
      providerId: provider.id,
      jobId,
      status: snap.status,
    });

    if (snap.status === "completed") {
      if (!snap.musicXml?.trim()) {
        return NextResponse.json(
          {
            jobId,
            status: "failed" as const,
            error: OMR_COPY.invalidScore,
          },
          { status: 422 },
        );
      }
      pieceImportLog("PARSE", "start", { where: "job completed validate" });
      const { musicXml } = validateRecognizedMusicXml(snap.musicXml);
      pieceImportLog("PARSE", "ok", { chars: musicXml.length });
      pieceImportLog("NORMALISE", "ok", { where: "job completed" });
      return NextResponse.json({
        jobId,
        status: "completed" as const,
        musicXml,
      });
    }

    if (snap.status === "failed") {
      return NextResponse.json({
        jobId,
        status: "failed" as const,
        error: snap.error || OMR_COPY.failed,
      });
    }

    return NextResponse.json({
      jobId,
      status: snap.status,
    });
  } catch (err) {
    pieceImportFail("OMR", err, {
      where: "GET /api/piece-omr/jobs/[jobId]",
      jobId,
      providerId: provider.id,
    });
    const status =
      err instanceof OmrError && err.userMessage === OMR_COPY.unavailable
        ? 503
        : 422;
    return NextResponse.json(
      {
        jobId,
        status: "failed" as const,
        error: omrUserMessage(err),
      },
      { status },
    );
  }
}
