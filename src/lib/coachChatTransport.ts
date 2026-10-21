/**
 * Shared HTTP helper for studio coach chat endpoints.
 * Domain prompts and reply shaping stay in each studio.
 */

export type CoachChatTransportResult<T> = {
  ok: true;
  data: T;
} | {
  ok: false;
};

/**
 * POST JSON to a coach API route. Returns null-shaped failure on network
 * or non-OK responses so callers can fall back to a local template reply.
 */
export async function postCoachChatJson<T>(
  path: string,
  body: unknown,
): Promise<CoachChatTransportResult<T>> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}
