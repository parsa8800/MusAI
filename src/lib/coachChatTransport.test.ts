import { afterEach, describe, expect, it, vi } from "vitest";
import { postCoachChatJson } from "@/lib/coachChatTransport";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postCoachChatJson", () => {
  it("returns data when the route responds OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ reply: "Hold the bow steady", source: "template" }),
      ),
    );
    const result = await postCoachChatJson<{ reply: string }>("/api/scale-coach-chat", {
      tip: "x",
    });
    expect(result).toEqual({
      ok: true,
      data: { reply: "Hold the bow steady", source: "template" },
    });
  });

  it("returns ok false when the route errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    const result = await postCoachChatJson("/api/scale-coach-chat", {});
    expect(result).toEqual({ ok: false });
  });

  it("returns ok false when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const result = await postCoachChatJson("/api/scale-coach-chat", {});
    expect(result).toEqual({ ok: false });
  });
});
