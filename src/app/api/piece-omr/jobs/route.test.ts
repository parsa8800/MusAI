import { beforeEach, describe, expect, it, vi } from "vitest";
import { TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";
import type { OmrInput } from "@/features/piece-studio/omr/omrProvider";
import type { OmrJobSnapshot } from "@/features/piece-studio/omr/omrJob";

const mocks = vi.hoisted(() => ({
  submitJob: vi.fn<(input: OmrInput) => Promise<{ jobId: string }>>(),
  getJob: vi.fn<(jobId: string) => Promise<OmrJobSnapshot>>(),
  recognize: vi.fn<(input: OmrInput) => Promise<{ musicXml: string }>>(),
  providerId: "audiveris" as string,
}));

vi.mock("@/features/piece-studio/omr/resolveOmrProvider", () => ({
  resolveOmrProvider: () => ({
    id: mocks.providerId,
    recognize: mocks.recognize,
    submitJob: mocks.submitJob,
    getJob: mocks.getJob,
  }),
  isOmrProviderConfigured: () => mocks.providerId !== "unavailable",
}));

describe("POST /api/piece-omr/jobs", () => {
  beforeEach(() => {
    mocks.submitJob.mockReset();
    mocks.getJob.mockReset();
    mocks.recognize.mockReset();
    mocks.providerId = "audiveris";
  });

  it("accepts a file and returns a job id without waiting for MusicXML", async () => {
    mocks.submitJob.mockResolvedValue({ jobId: "job-abc" });
    const { POST } = await import("@/app/api/piece-omr/jobs/route");
    const form = new FormData();
    form.append("file", new File(["png"], "page.png", { type: "image/png" }));
    const res = await POST(
      new Request("http://localhost/api/piece-omr/jobs", {
        method: "POST",
        body: form,
      }),
    );
    expect(res.status).toBe(202);
    const data = (await res.json()) as { jobId: string; status: string };
    expect(data.jobId).toBe("job-abc");
    expect(data.status).toBe("queued");
    expect(mocks.recognize).not.toHaveBeenCalled();
  });

  it("rejects non sheet-music uploads", async () => {
    const { POST } = await import("@/app/api/piece-omr/jobs/route");
    const form = new FormData();
    form.append("file", new File(["x"], "ref.mp3", { type: "audio/mpeg" }));
    const res = await POST(
      new Request("http://localhost/api/piece-omr/jobs", {
        method: "POST",
        body: form,
      }),
    );
    expect(res.status).toBe(400);
    expect(mocks.submitJob).not.toHaveBeenCalled();
  });
});

describe("GET /api/piece-omr/jobs/[jobId]", () => {
  beforeEach(() => {
    mocks.getJob.mockReset();
    mocks.providerId = "audiveris";
  });

  it("returns validated MusicXML when the job completed", async () => {
    mocks.getJob.mockResolvedValue({
      id: "job-abc",
      status: "completed",
      musicXml: TWINKLE_XML,
    });
    const { GET } = await import("@/app/api/piece-omr/jobs/[jobId]/route");
    const res = await GET(new Request("http://localhost/api/piece-omr/jobs/job-abc"), {
      params: Promise.resolve({ jobId: "job-abc" }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string; musicXml: string };
    expect(data.status).toBe("completed");
    expect(data.musicXml).toContain("Twinkle");
  });

  it("returns processing without MusicXML while the worker runs", async () => {
    mocks.getJob.mockResolvedValue({
      id: "job-abc",
      status: "processing",
    });
    const { GET } = await import("@/app/api/piece-omr/jobs/[jobId]/route");
    const res = await GET(new Request("http://localhost/api/piece-omr/jobs/job-abc"), {
      params: Promise.resolve({ jobId: "job-abc" }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string; musicXml?: string };
    expect(data.status).toBe("processing");
    expect(data.musicXml).toBeUndefined();
  });
});
