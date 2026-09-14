import { describe, expect, it, vi } from "vitest";
import { createAudiverisOmrProvider } from "@/features/piece-studio/omr/audiverisOmrProvider";
import { createFlatOmrProvider } from "@/features/piece-studio/omr/flatOmrProvider";
import { createHttpOmrProvider } from "@/features/piece-studio/omr/httpOmrProvider";
import { OMR_COPY, OmrError } from "@/features/piece-studio/omr/omrProvider";
import { resolveOmrProvider, isOmrReadingAvailable } from "@/features/piece-studio/omr/resolveOmrProvider";
import { isSheetMusicScan } from "@/features/piece-studio/omr/sheetMusicScan";
import { validateRecognizedMusicXml } from "@/features/piece-studio/omr/validateRecognizedMusicXml";
import { TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("sheet music scan kinds", () => {
  it("accepts PDF and common photo types only", () => {
    expect(isSheetMusicScan("page.pdf", "application/pdf")).toBe(true);
    expect(isSheetMusicScan("page.png", "image/png")).toBe(true);
    expect(isSheetMusicScan("page.jpg", "image/jpeg")).toBe(true);
    expect(isSheetMusicScan("page.jpeg", "")).toBe(true);
    expect(isSheetMusicScan("page.webp", "image/webp")).toBe(false);
    expect(isSheetMusicScan("tune.musicxml", "application/xml")).toBe(false);
  });
});

describe("validateRecognizedMusicXml", () => {
  it("accepts partwise MusicXML", () => {
    const { score } = validateRecognizedMusicXml(TWINKLE_XML);
    expect(score.title).toBe("Twinkle");
    expect(score.parts.length).toBeGreaterThan(0);
  });

  it("rejects garbage as a failed read, not a parser dump", () => {
    expect(() => validateRecognizedMusicXml("not music")).toThrow(OmrError);
    expect(() => validateRecognizedMusicXml("not music")).toThrow(
      OMR_COPY.invalidScore,
    );
  });
});

describe("resolveOmrProvider", () => {
  it("uses Flat when a token is present", () => {
    expect(
      resolveOmrProvider({ MUSAI_FLAT_API_TOKEN: "flat-secret" }).id,
    ).toBe("flat");
  });

  it("uses Audiveris for the local worker URL on :8090", () => {
    expect(
      resolveOmrProvider({ MUSAI_OMR_URL: "http://127.0.0.1:8090" }).id,
    ).toBe("audiveris");
  });

  it("uses Audiveris when explicitly selected", () => {
    expect(
      resolveOmrProvider({
        MUSAI_OMR_PROVIDER: "audiveris",
        MUSAI_OMR_URL: "http://omr.internal:8090",
      }).id,
    ).toBe("audiveris");
  });

  it("defaults to the local Audiveris worker outside production", () => {
    expect(resolveOmrProvider({ NODE_ENV: "development" }).id).toBe("audiveris");
    expect(resolveOmrProvider({ NODE_ENV: "test" }).id).toBe("audiveris");
  });

  it("stays unavailable in production when nothing is configured", () => {
    expect(resolveOmrProvider({ NODE_ENV: "production" }).id).toBe("unavailable");
  });

  it("uses a generic HTTP engine when configured", () => {
    expect(
      resolveOmrProvider({
        MUSAI_OMR_PROVIDER: "http",
        MUSAI_OMR_URL: "http://localhost:9000/omr",
      }).id,
    ).toBe("http");
  });

  it("can be forced off with MUSAI_OMR_PROVIDER=none", () => {
    expect(
      resolveOmrProvider({
        NODE_ENV: "development",
        MUSAI_OMR_PROVIDER: "none",
      }).id,
    ).toBe("unavailable");
  });
});

describe("isOmrReadingAvailable", () => {
  it("reports offline when the Audiveris worker healthz is down", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const status = await isOmrReadingAvailable(
      { NODE_ENV: "development" },
      fetchImpl as unknown as typeof fetch,
    );
    expect(status.available).toBe(false);
    expect(status.providerId).toBe("audiveris");
    expect(status.message).toBe(OMR_COPY.scanningUnavailable);
  });

  it("is available when the worker reports Audiveris configured", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        audiverisConfigured: true,
        service: "musai-omr-worker",
      }),
    );
    const status = await isOmrReadingAvailable(
      { NODE_ENV: "development" },
      fetchImpl as unknown as typeof fetch,
    );
    expect(status.available).toBe(true);
    expect(status.message).toBeNull();
  });
});

describe("createAudiverisOmrProvider", () => {
  it("submits a job and polls until MusicXML is ready", async () => {
    let polls = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/v1/jobs") && method === "POST") {
        return jsonResponse({ jobId: "w1", status: "queued" }, 202);
      }
      if (url.includes("/v1/jobs/w1")) {
        polls += 1;
        if (polls < 2) {
          return jsonResponse({ id: "w1", status: "processing" });
        }
        return jsonResponse({
          id: "w1",
          status: "completed",
          musicXml: TWINKLE_XML,
        });
      }
      throw new Error(url);
    });
    const provider = createAudiverisOmrProvider({
      baseUrl: "http://omr.test",
      fetch: fetchImpl as unknown as typeof fetch,
      pollIntervalMs: 1,
      maxWaitMs: 5_000,
    });
    const result = await provider.recognize({
      bytes: new TextEncoder().encode("png").buffer,
      fileName: "page.png",
      mimeType: "image/png",
    });
    expect(result.musicXml).toContain("Twinkle");
    expect(provider.id).toBe("audiveris");
    expect(polls).toBeGreaterThanOrEqual(2);
  });

  it("surfaces worker failures as simple copy", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/v1/jobs") && (init?.method ?? "GET") === "POST") {
        return jsonResponse({ jobId: "w2" }, 202);
      }
      return jsonResponse({
        id: "w2",
        status: "failed",
        error: OMR_COPY.noMusic,
      });
    });
    const provider = createAudiverisOmrProvider({
      baseUrl: "http://omr.test",
      fetch: fetchImpl as unknown as typeof fetch,
      pollIntervalMs: 1,
      maxWaitMs: 1_000,
    });
    await expect(
      provider.recognize({
        bytes: new TextEncoder().encode("x").buffer,
        fileName: "blank.png",
        mimeType: "image/png",
      }),
    ).rejects.toMatchObject({ userMessage: OMR_COPY.noMusic });
  });
});

describe("createHttpOmrProvider", () => {
  it("posts the file and reads MusicXML from the body", async () => {
    const fetchImpl = vi.fn(async () => new Response(TWINKLE_XML, { status: 200 }));
    const provider = createHttpOmrProvider({
      url: "http://omr.test/recognize",
      fetch: fetchImpl as unknown as typeof fetch,
    });
    const result = await provider.recognize({
      bytes: new TextEncoder().encode("png").buffer,
      fileName: "page.png",
      mimeType: "image/png",
    });
    expect(result.musicXml).toContain("Twinkle");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

describe("createFlatOmrProvider", () => {
  it("runs a one-shot job and exports MusicXML", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/omr/jobs") && method === "POST") {
        return jsonResponse({ id: "job1", status: "processing" });
      }
      if (url.includes("/exports/musicxml")) {
        return new Response(TWINKLE_XML, { status: 200 });
      }
      if (url.includes("/omr/jobs/job1") && method === "DELETE") {
        return new Response("", { status: 200 });
      }
      if (url.includes("/omr/jobs/job1")) {
        return jsonResponse({
          id: "job1",
          status: "done",
          result: { exports: ["musicxml"] },
        });
      }
      throw new Error(url);
    });
    const provider = createFlatOmrProvider({
      token: "tok",
      fetch: fetchImpl as unknown as typeof fetch,
      pollWaitSec: 0,
      maxWaitMs: 1_000,
    });
    const result = await provider.recognize({
      bytes: new TextEncoder().encode("%PDF").buffer,
      fileName: "etude.pdf",
      mimeType: "application/pdf",
    });
    expect(result.musicXml).toContain("<score-partwise");
    expect(provider.id).toBe("flat");
  });

  it("exposes submitJob/getJob for browser polling", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/omr/jobs") && method === "POST") {
        return jsonResponse({ id: "job3", status: "processing" });
      }
      if (url.includes("/exports/musicxml")) {
        return new Response(TWINKLE_XML, { status: 200 });
      }
      if (url.includes("/omr/jobs/job3") && method === "DELETE") {
        return new Response("", { status: 200 });
      }
      return jsonResponse({ id: "job3", status: "done" });
    });
    const provider = createFlatOmrProvider({
      token: "tok",
      fetch: fetchImpl as unknown as typeof fetch,
      pollWaitSec: 0,
    });
    const { jobId } = await provider.submitJob!({
      bytes: new TextEncoder().encode("x").buffer,
      fileName: "p.png",
      mimeType: "image/png",
    });
    const snap = await provider.getJob!(jobId);
    expect(snap.status).toBe("completed");
    expect(snap.musicXml).toContain("Twinkle");
  });

  it("maps recognition misses to simple copy", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/omr/jobs") && method === "POST") {
        return jsonResponse({ id: "job2", status: "processing" });
      }
      if (url.includes("/omr/jobs/job2") && method === "DELETE") {
        return new Response("", { status: 200 });
      }
      return jsonResponse({
        id: "job2",
        status: "error",
        errorCode: "NO_MUSIC_DETECTED",
      });
    });
    const provider = createFlatOmrProvider({
      token: "tok",
      fetch: fetchImpl as unknown as typeof fetch,
      pollWaitSec: 0,
      maxWaitMs: 1_000,
    });
    await expect(
      provider.recognize({
        bytes: new TextEncoder().encode("x").buffer,
        fileName: "blank.png",
        mimeType: "image/png",
      }),
    ).rejects.toMatchObject({ userMessage: OMR_COPY.noMusic });
  });
});
