"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { pageFillsGuide } from "@/features/piece-studio/pageScanGuide";

const LOCK_SAMPLES = 4;

/**
 * Camera for a sheet of music. The frame takes the photo when a page
 * fills it, and the shutter takes one whenever you tap.
 */
export function PiecePageScan({
  onCapture,
  onClose,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lockedRef = useRef(0);
  const takenRef = useRef(false);
  const onCaptureRef = useRef(onCapture);
  const onCloseRef = useRef(onClose);
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  onCaptureRef.current = onCapture;
  onCloseRef.current = onClose;

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    if (!video) return;

    void (async () => {
      try {
        const stream = await openCamera();
        if (cancelled) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;
        video.srcObject = stream;
        await video.play();
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setError("The camera isn’t available");
      }
    })();

    return () => {
      cancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const video = videoRef.current;
    if (!video) return;
    const timer = window.setInterval(() => {
      if (takenRef.current || video.videoWidth < 2) return;
      const frame = frameRef.current;
      const guide = frame ? guideInPicture(video, frame) : null;
      if (!guide) return;
      const ctx = sampleContext(video);
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, ctx.canvas.width, ctx.canvas.height);
      const hit = pageFillsGuide(
        ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height),
        guide,
      );
      lockedRef.current = hit ? lockedRef.current + 1 : 0;
      const nextLocked = lockedRef.current > 0;
      setLocked((prev) => (prev === nextLocked ? prev : nextLocked));
      if (lockedRef.current >= LOCK_SAMPLES) {
        const frame = frameRef.current;
        void takePhoto(video, frame, onCaptureRef, onCloseRef, takenRef);
      }
    }, 180);

    return () => window.clearInterval(timer);
  }, [ready]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const take = () => {
    const video = videoRef.current;
    if (!video) return;
    void takePhoto(video, frameRef.current, onCaptureRef, onCloseRef, takenRef);
  };

  const node = (
    <div className="musai-page-scan" role="dialog" aria-label="Scan a page">
      <video
        ref={videoRef}
        className="musai-page-scan__video"
        playsInline
        muted
        autoPlay
      />
      <div
        ref={frameRef}
        className="musai-page-scan__frame"
        data-lock={locked ? "true" : "false"}
      />
      <button
        type="button"
        className="musai-page-scan__close"
        aria-label="Close camera"
        onClick={onClose}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <div className="musai-page-scan__bar">
        <p className="musai-page-scan__hint">
          {error ?? (locked ? "Hold still" : "Fit the page in the frame")}
        </p>
        <button
          type="button"
          className="musai-page-scan__shutter"
          aria-label="Take photo"
          disabled={!ready || Boolean(error)}
          onClick={() => void take()}
        >
          <span />
        </button>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

async function openCamera(): Promise<MediaStream> {
  const tries: MediaStreamConstraints[] = [
    { audio: false, video: { facingMode: { ideal: "environment" } } },
    { audio: false, video: true },
  ];
  let last: unknown;
  for (const constraints of tries) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error("camera");
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function takePhoto(
  video: HTMLVideoElement,
  frame: HTMLElement | null,
  onCaptureRef: { current: (file: File) => void },
  onCloseRef: { current: () => void },
  takenRef: { current: boolean },
) {
  if (takenRef.current || video.videoWidth < 2) return;
  takenRef.current = true;
  void stillFile(video, frame).then((file) => {
    if (!file) {
      takenRef.current = false;
      return;
    }
    onCaptureRef.current(file);
    onCloseRef.current();
  });
}

let sampleCanvas: HTMLCanvasElement | null = null;

function sampleContext(video: HTMLVideoElement): CanvasRenderingContext2D | null {
  const canvas = (sampleCanvas ??= document.createElement("canvas"));
  const width = 96;
  const height = Math.max(16, Math.round((width * video.videoHeight) / video.videoWidth));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return canvas.getContext("2d", { willReadFrequently: true });
}

/** Page rectangle in the camera picture, matching the on-screen paper frame. */
function guideInPicture(
  video: HTMLVideoElement,
  frame: HTMLElement,
): { x: number; y: number; w: number; h: number } | null {
  const box = video.getBoundingClientRect();
  const page = frame.getBoundingClientRect();
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (box.width < 2 || box.height < 2 || page.width < 2 || vw < 2 || vh < 2) return null;
  const scale = Math.max(box.width / vw, box.height / vh);
  const offsetX = (vw * scale - box.width) / 2;
  const offsetY = (vh * scale - box.height) / 2;
  const x = (page.left - box.left + offsetX) / (vw * scale);
  const y = (page.top - box.top + offsetY) / (vh * scale);
  const right = (page.right - box.left + offsetX) / (vw * scale);
  const bottom = (page.bottom - box.top + offsetY) / (vh * scale);
  return { x, y, w: Math.max(0.02, right - x), h: Math.max(0.02, bottom - y) };
}

function stillFile(
  video: HTMLVideoElement,
  frame: HTMLElement | null,
): Promise<File | null> {
  const guide = frame ? guideInPicture(video, frame) : null;
  const sx = guide ? guide.x * video.videoWidth : 0;
  const sy = guide ? guide.y * video.videoHeight : 0;
  const sw = guide ? guide.w * video.videoWidth : video.videoWidth;
  const sh = guide ? guide.h * video.videoHeight : video.videoHeight;
  const longest = Math.max(sw, sh);
  const scale = Math.min(1, 2000 / longest);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        resolve(new File([blob], "page-scan.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  });
}
