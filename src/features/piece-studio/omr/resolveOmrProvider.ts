import {
  OMR_COPY,
  type OMRProvider,
} from "@/features/piece-studio/omr/omrProvider";
import { createAudiverisOmrProvider } from "@/features/piece-studio/omr/audiverisOmrProvider";
import { createFlatOmrProvider } from "@/features/piece-studio/omr/flatOmrProvider";
import { createHttpOmrProvider } from "@/features/piece-studio/omr/httpOmrProvider";
import { createUnavailableOmrProvider } from "@/features/piece-studio/omr/unavailableOmrProvider";

type Env = Record<string, string | undefined>;

export const DEFAULT_AUDIVERIS_WORKER = "http://127.0.0.1:8090";

/**
 * Pick a recognition backend from env. Piece Studio never imports a vendor
 * client directly — swap providers here.
 *
 * Local prototype default (non-production): Audiveris worker on :8090.
 * Production stays unavailable until `MUSAI_OMR_PROVIDER` / URL / Flat is set.
 *
 * Audiveris runs in `services/omr-worker` — never inside Next.js / Vercel.
 */
export function resolveOmrProvider(env: Env = process.env): OMRProvider {
  const explicit = env.MUSAI_OMR_PROVIDER?.trim().toLowerCase();
  const engine = env.MUSAI_OMR_ENGINE?.trim().toLowerCase();
  const flatToken =
    env.MUSAI_FLAT_API_TOKEN?.trim() || env.FLAT_API_TOKEN?.trim() || "";
  const httpUrl = env.MUSAI_OMR_URL?.trim() || "";
  const httpToken = env.MUSAI_OMR_TOKEN?.trim() || "";
  const isProd = env.NODE_ENV === "production";

  if (explicit === "none") return createUnavailableOmrProvider();

  if (explicit === "audiveris" || engine === "audiveris") {
    return createAudiverisOmrProvider({
      baseUrl: httpUrl || DEFAULT_AUDIVERIS_WORKER,
      token: httpToken || undefined,
    });
  }
  if (explicit === "flat") {
    return flatToken
      ? createFlatOmrProvider({ token: flatToken })
      : createUnavailableOmrProvider();
  }
  if (explicit === "http") {
    return httpUrl
      ? createHttpOmrProvider({ url: httpUrl, token: httpToken || undefined })
      : createUnavailableOmrProvider();
  }

  if (flatToken) return createFlatOmrProvider({ token: flatToken });
  if (httpUrl) {
    if (isAudiverisWorkerUrl(httpUrl)) {
      return createAudiverisOmrProvider({
        baseUrl: httpUrl,
        token: httpToken || undefined,
      });
    }
    return createHttpOmrProvider({
      url: httpUrl,
      token: httpToken || undefined,
    });
  }

  // Local / test prototype: talk to the dedicated Audiveris worker by default.
  if (!isProd) {
    return createAudiverisOmrProvider({
      baseUrl: DEFAULT_AUDIVERIS_WORKER,
      token: httpToken || undefined,
    });
  }

  return createUnavailableOmrProvider();
}

/** True when a recognition backend is selected (not the unavailable stub). */
export function isOmrProviderConfigured(env: Env = process.env): boolean {
  return resolveOmrProvider(env).id !== "unavailable";
}

/** Heuristic for the dedicated job worker (local :8090 or omr-worker host). */
export function isAudiverisWorkerUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.port === "8090") return true;
    if (/omr-worker/i.test(u.hostname)) return true;
    if (/\/v1\/jobs\/?$/i.test(u.pathname)) return true;
    return false;
  } catch {
    return /:8090\b/i.test(url) || /omr-worker/i.test(url);
  }
}

export type OmrWorkerHealth = {
  reachable: boolean;
  audiverisConfigured: boolean;
  service?: string;
  error?: string;
};

/** Probe the Audiveris worker `/healthz` (server-side only). */
export async function probeAudiverisWorkerHealth(
  env: Env = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<OmrWorkerHealth> {
  const base = (env.MUSAI_OMR_URL?.trim() || DEFAULT_AUDIVERIS_WORKER).replace(
    /\/$/,
    "",
  );
  const token = env.MUSAI_OMR_TOKEN?.trim() || "";
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetchImpl(`${base}/healthz`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) {
      return {
        reachable: false,
        audiverisConfigured: false,
        error: `healthz HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as {
      ok?: unknown;
      audiverisConfigured?: unknown;
      service?: unknown;
    };
    return {
      reachable: data.ok === true || res.ok,
      audiverisConfigured: data.audiverisConfigured === true,
      service: typeof data.service === "string" ? data.service : undefined,
    };
  } catch (err) {
    return {
      reachable: false,
      audiverisConfigured: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Whether photo/PDF reading can actually run right now.
 * For Audiveris, the worker must be up and report Audiveris installed.
 */
export async function isOmrReadingAvailable(
  env: Env = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<{
  available: boolean;
  message: string | null;
  providerId: string;
  worker?: OmrWorkerHealth;
}> {
  const provider = resolveOmrProvider(env);
  if (provider.id === "unavailable") {
    return {
      available: false,
      message: OMR_COPY.scanningUnavailable,
      providerId: provider.id,
    };
  }
  if (provider.id === "audiveris") {
    const worker = await probeAudiverisWorkerHealth(env, fetchImpl);
    if (!worker.reachable) {
      return {
        available: false,
        message: OMR_COPY.scanningUnavailable,
        providerId: provider.id,
        worker,
      };
    }
    if (!worker.audiverisConfigured) {
      return {
        available: false,
        message: OMR_COPY.scanningUnavailable,
        providerId: provider.id,
        worker,
      };
    }
    return {
      available: true,
      message: null,
      providerId: provider.id,
      worker,
    };
  }
  return {
    available: true,
    message: null,
    providerId: provider.id,
  };
}
