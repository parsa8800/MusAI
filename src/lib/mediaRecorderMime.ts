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
