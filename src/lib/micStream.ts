/**
 * Opens the microphone with fallbacks that work better for routed inputs
 * (e.g. iPhone Continuity, Bluetooth, virtual devices) where aggressive
 * echo cancellation can silence the signal.
 */

export class MicUnavailableError extends Error {
  readonly code: "insecure" | "unsupported";

  constructor(message: string, code: "insecure" | "unsupported") {
    super(message);
    this.name = "MicUnavailableError";
    this.code = code;
  }
}

function getUserMediaFn(): typeof navigator.mediaDevices.getUserMedia | null {
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia) return null;
  return md.getUserMedia.bind(md);
}

export function describeMicOpenError(err: unknown): string {
  if (err instanceof MicUnavailableError) return err.message;
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Microphone blocked. Allow access in the address bar, or use Import.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone was found. Connect a mic or pick another input.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "The microphone is in use by another app. Close it and try again.";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "That input is not available. Switch Input to Default and try again.";
  }
  if (name === "SecurityError") {
    return "Microphone needs http://127.0.0.1:3000 in Chrome.";
  }
  return "Could not open the microphone. Open http://127.0.0.1:3000 in Google Chrome.";
}

async function preferRawCapture(stream: MediaStream): Promise<void> {
  const track = stream.getAudioTracks?.()[0];
  if (!track?.applyConstraints) return;
  try {
    await track.applyConstraints({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: true,
    });
  } catch {
    /* keep the stream even if the device rejects these */
  }
}

export async function getMicStream(
  preferredDeviceId?: string | null,
): Promise<MediaStream> {
  const gum = getUserMediaFn();
  if (!gum) {
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      throw new MicUnavailableError(
        "Microphone needs http://127.0.0.1:3000 in Google Chrome.",
        "insecure",
      );
    }
    throw new MicUnavailableError(
      "This browser cannot use the microphone. Open http://127.0.0.1:3000 in Google Chrome.",
      "unsupported",
    );
  }

  const deviceId = preferredDeviceId?.trim() || null;
  const attempts: MediaStreamConstraints[] = deviceId
    ? [
        { audio: { deviceId: { ideal: deviceId } }, video: false },
        { audio: { deviceId: { exact: deviceId } }, video: false },
        { audio: true, video: false },
      ]
    : [
        { audio: true, video: false },
        {
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: true,
          },
          video: false,
        },
      ];

  let lastError: unknown;
  for (const constraints of attempts) {
    try {
      const stream = await gum(constraints);
      await preferRawCapture(stream);
      return stream;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}
