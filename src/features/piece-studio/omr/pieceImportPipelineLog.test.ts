import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  pieceImportFail,
  pieceImportLog,
} from "@/features/piece-studio/omr/pieceImportPipelineLog";
import {
  isOmrProviderConfigured,
  resolveOmrProvider,
} from "@/features/piece-studio/omr/resolveOmrProvider";

describe("piece import pipeline diagnosis helpers", () => {
  const prevNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (prevNodeEnv !== undefined) {
      vi.stubEnv("NODE_ENV", prevNodeEnv);
    }
    vi.restoreAllMocks();
  });

  it("logs stages in development", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    pieceImportLog("OMR", "skip", { reason: "test" });
    expect(info).toHaveBeenCalledWith(
      "[piece-import:OMR:skip]",
      expect.objectContaining({ reason: "test" }),
    );
  });

  it("logs failures with the real message", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    pieceImportFail("OMR", new Error("provider unavailable / not configured"), {
      providerId: "unavailable",
    });
    expect(error).toHaveBeenCalledWith(
      "[piece-import:OMR:fail]",
      expect.objectContaining({
        message: "provider unavailable / not configured",
        providerId: "unavailable",
      }),
    );
  });
});

describe("resolveOmrProvider in this environment", () => {
  it("defaults to Audiveris locally and stays off in production when unset", () => {
    expect(
      resolveOmrProvider({
        NODE_ENV: "development",
        MUSAI_OMR_PROVIDER: undefined,
        MUSAI_FLAT_API_TOKEN: undefined,
        FLAT_API_TOKEN: undefined,
        MUSAI_OMR_URL: undefined,
      }).id,
    ).toBe("audiveris");
    expect(
      resolveOmrProvider({
        NODE_ENV: "production",
        MUSAI_OMR_PROVIDER: undefined,
        MUSAI_FLAT_API_TOKEN: undefined,
        FLAT_API_TOKEN: undefined,
        MUSAI_OMR_URL: undefined,
      }).id,
    ).toBe("unavailable");
    expect(
      isOmrProviderConfigured({
        NODE_ENV: "production",
        MUSAI_OMR_PROVIDER: undefined,
        MUSAI_FLAT_API_TOKEN: undefined,
        FLAT_API_TOKEN: undefined,
        MUSAI_OMR_URL: undefined,
      }),
    ).toBe(false);
  });
});
