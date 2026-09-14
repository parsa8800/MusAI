import { beforeEach, describe, expect, it, vi } from "vitest";
import { TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";
import type { OmrInput } from "@/features/piece-studio/omr/omrProvider";

const mocks = vi.hoisted(() => ({
  recognize: vi.fn<(input: OmrInput) => Promise<{ musicXml: string }>>(),
}));

vi.mock("@/features/piece-studio/omr/resolveOmrProvider", () => ({
  resolveOmrProvider: () => ({ id: "mock", recognize: mocks.recognize }),
  isOmrProviderConfigured: () => true,
  isOmrReadingAvailable: async () => ({
    available: true,
    message: null,
    providerId: "mock",
  }),
  DEFAULT_AUDIVERIS_WORKER: "http://127.0.0.1:8090",
}));

describe("POST /api/piece-omr", () => {
  beforeEach(() => {
    mocks.recognize.mockReset();
  });

  it("returns validated MusicXML from the active provider", async () => {
    mocks.recognize.mockResolvedValue({ musicXml: TWINKLE_XML });
    const { POST } = await import("@/app/api/piece-omr/route");
    const form = new FormData();
    form.append("file", new File(["png"], "page.png", { type: "image/png" }));
    const res = await POST(
      new Request("http://localhost/api/piece-omr", { method: "POST", body: form }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { musicXml: string };
    expect(data.musicXml).toContain("Twinkle");
  });

  it("rejects files that are not a photo or PDF", async () => {
    const { POST } = await import("@/app/api/piece-omr/route");
    const form = new FormData();
    form.append("file", new File(["x"], "ref.mp3", { type: "audio/mpeg" }));
    const res = await POST(
      new Request("http://localhost/api/piece-omr", { method: "POST", body: form }),
    );
    expect(res.status).toBe(400);
    expect(mocks.recognize).not.toHaveBeenCalled();
  });

  it("rejects invalid MusicXML from a provider", async () => {
    mocks.recognize.mockResolvedValue({ musicXml: "not a score" });
    const { POST } = await import("@/app/api/piece-omr/route");
    const form = new FormData();
    form.append("file", new File(["x"], "page.jpg", { type: "image/jpeg" }));
    const res = await POST(
      new Request("http://localhost/api/piece-omr", { method: "POST", body: form }),
    );
    expect(res.status).toBe(422);
    const data = (await res.json()) as { error: string };
    expect(data.error.toLowerCase()).not.toMatch(/omr|ocr/);
  });

  it("reports whether reading is connected", async () => {
    const { GET } = await import("@/app/api/piece-omr/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { available: boolean };
    expect(typeof data.available).toBe("boolean");
  });
});
