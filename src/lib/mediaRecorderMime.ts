/** Best-effort MIME for `MediaRecorder` across browsers. */
export function pickRecorderMime(): string | undefined {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return undefined;
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
    "audio/mp4;codecs=mp4a.40.2",
  ];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

/** Create a recorder without starting it (attach listeners first). */
export function createMediaRecorder(stream: MediaStream): MediaRecorder {
  if (typeof MediaRecorder === "undefined") {
    throw new DOMException(
      "MediaRecorder is not available in this browser.",
      "NotSupportedError",
    );
  }
  const mimeType = pickRecorderMime();
  try {
    return mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
  } catch {
    return new MediaRecorder(stream);
  }
}

/** Some browsers reject a timeslice argument. */
export function startMediaRecorder(
  recorder: MediaRecorder,
  timesliceMs = 100,
): void {
  try {
    recorder.start(timesliceMs);
  } catch {
    recorder.start();
  }
}

/**
 * Stop the recorder and wait until its last chunk can land.
 * `stop()` is specified to flush `dataavailable` first, but some browsers
 * fire `stop` before that chunk. Sealing immediately drops a real take.
 * Do not call `requestData()` before `stop()` — that race is the same bug.
 */
export function awaitRecorderChunks(
  recorder: MediaRecorder,
  chunks: Blob[],
): Promise<"stopped" | "failed"> {
  if (recorder.state === "inactive") {
    return Promise.resolve(
      chunks.some((chunk) => chunk.size > 0) ? "stopped" : "failed",
    );
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: "stopped" | "failed") => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
    const seal = () => {
      if (chunks.some((chunk) => chunk.size > 0)) finish("stopped");
      else setTimeout(() => finish("stopped"), 50);
    };
    recorder.addEventListener("stop", () => setTimeout(seal, 0), { once: true });
    recorder.addEventListener("error", () => finish("failed"), { once: true });
    try {
      recorder.stop();
    } catch {
      finish("failed");
    }
  });
}

export function blobFromRecorderChunks(
  recorder: Pick<MediaRecorder, "mimeType">,
  chunks: readonly Blob[],
): Blob {
  return new Blob([...chunks], { type: recorder.mimeType || "audio/webm" });
}
