/** Best-effort MIME for `MediaRecorder` across browsers. */
export function pickRecorderMime(): string | undefined {
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
