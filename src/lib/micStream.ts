/**
 * Opens the microphone with fallbacks that work better for routed inputs
 * (e.g. iPhone Continuity, Bluetooth, virtual devices) where aggressive
 * echo cancellation can silence the signal.
 */
export async function getMicStream(
  preferredDeviceId?: string | null,
): Promise<MediaStream> {
  const withDevice = (
    audio: boolean | MediaTrackConstraints,
  ): MediaStreamConstraints => ({
    audio:
      typeof audio === "boolean"
        ? audio
        : preferredDeviceId
          ? { ...audio, deviceId: { exact: preferredDeviceId } }
          : audio,
  });

  const attempts: MediaStreamConstraints[] = [
    withDevice({
      channelCount: { ideal: 1 },
      echoCancellation: { ideal: false },
      noiseSuppression: { ideal: false },
      autoGainControl: { ideal: true },
    }),
    withDevice({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: true,
    }),
    preferredDeviceId
      ? { audio: { deviceId: { exact: preferredDeviceId } } }
      : { audio: true },
  ];

  let lastError: unknown;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}
