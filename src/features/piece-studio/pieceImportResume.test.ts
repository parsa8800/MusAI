import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPieceFileMemory } from "@/features/piece-studio/pieceStudioFiles";
import {
  importPieceFromFile,
  restorePieceImportSession,
  resumeActivePieceImport,
} from "@/features/piece-studio/pieceStudioImport";
import {
  beginActivePieceImport,
  clearActivePieceImport,
  rememberActivePieceImportJob,
} from "@/features/piece-studio/pieceImportResume";
import { TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("piece import resume", () => {
  afterEach(async () => {
    await clearActivePieceImport();
    clearPieceFileMemory();
    vi.unstubAllGlobals();
  });

  it("restores a finished upload after page state is gone", async () => {
    const file = new File(["%PDF-1.4"], "Beach Holiday.pdf", {
      type: "application/pdf",
    });
    const result = await importPieceFromFile(file, new Date(), {
      recognizeSheet: async () => TWINKLE_XML,
    });
    expect(result.status).toBe("ready");

    const restored = await restorePieceImportSession();
    expect(restored?.status).toBe("ready");
    if (restored?.status !== "ready") return;
    expect(restored.draft.title).toBe("Twinkle");
    expect(restored.draft.sourceFileName).toBe("Beach Holiday.pdf");
    expect(restored.draft.musicXml).toContain("score-partwise");
  });

  it("keeps polling the same job after a refresh instead of uploading again", async () => {
    const file = new File(["%PDF-1.4"], "Beach Holiday.pdf", {
      type: "application/pdf",
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/piece-omr/jobs/job-beach")) {
        return jsonResponse(
          { status: "completed", musicXml: TWINKLE_XML, progress: 100 },
          200,
        );
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await beginActivePieceImport(file, "pdf");
    rememberActivePieceImportJob("job-beach");
    const mid = await restorePieceImportSession();
    expect(mid).toMatchObject({ status: "reading", jobId: "job-beach" });
    if (!mid || mid.status !== "reading") return;

    const done = await resumeActivePieceImport(mid.file, mid.jobId);
    expect(done.status).toBe("ready");
    if (done.status !== "ready") return;
    expect(done.draft.title).toBe("Twinkle");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("job-beach");
  });
});
