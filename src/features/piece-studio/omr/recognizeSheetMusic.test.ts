import { afterEach, describe, expect, it, vi } from "vitest";
import { OMR_COPY } from "@/features/piece-studio/omr/omrProvider";
import { recognizeSheetMusic } from "@/features/piece-studio/omr/recognizeSheetMusic";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("recognizeSheetMusic", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stops when the hosted site has no score reader", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/piece-omr/jobs")) {
        return jsonResponse(
          { error: OMR_COPY.scanningUnavailable, code: "unavailable" },
          503,
        );
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["%PDF"], "score.pdf", { type: "application/pdf" });
    await expect(recognizeSheetMusic(file)).rejects.toThrow(
      OMR_COPY.scanningUnavailable,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the one-shot reader only when the server asks", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/piece-omr/jobs")) {
        return jsonResponse(
          { error: OMR_COPY.readingNotReady, code: "sync" },
          503,
        );
      }
      if (url.endsWith("/api/piece-omr")) {
        return jsonResponse({ musicXml: "<score-partwise></score-partwise>" }, 200);
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["png"], "page.png", { type: "image/png" });
    await expect(recognizeSheetMusic(file)).resolves.toContain("score-partwise");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
