"use client";

import type { RefObject } from "react";
import { MusaiFileImport } from "@/components/MusaiFileImport";
import {
  PIECE_STUDIO_UPLOAD_ACCEPT,
  PIECE_UPLOAD_MAX_BYTES,
} from "@/features/piece-studio/pieceStudioImport";
import { OMR_COPY } from "@/features/piece-studio/omr/omrProvider";

/**
 * Piece Studio import surface — shared MusaiFileImport gate + Piece motif/copy.
 * Click and drop both call {@link onFile} once (via MusaiFileImport’s single gate).
 */
export function PieceImportDropzone({
  busy = false,
  busyLabel,
  disabled = false,
  onFile,
  onReject,
  error = null,
  inputRef,
  compact = false,
}: {
  busy?: boolean;
  busyLabel?: string | null;
  disabled?: boolean;
  onFile: (file: File) => void;
  onReject?: (message: string) => void;
  error?: string | null;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Smaller target once the library already has pieces. */
  compact?: boolean;
}) {
  return (
    <>
      <MusaiFileImport
        testId="piece-import-dropzone"
        className={[
          "musai-piece-drop",
          compact ? "musai-piece-drop--compact" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        acceptedFiles={PIECE_STUDIO_UPLOAD_ACCEPT}
        maxSizeBytes={PIECE_UPLOAD_MAX_BYTES}
        label={OMR_COPY.dropMusic}
        inputAriaLabel={OMR_COPY.importMusic}
        processing={busy}
        processingLabel={busyLabel ?? OMR_COPY.reading}
        disabled={disabled}
        compact={compact}
        inputRef={inputRef}
        error={error}
        onReject={onReject}
        onFilesSelected={(files) => {
          const file = files[0];
          if (file) onFile(file);
        }}
        motif={<DropzoneStaffMotif />}
      />
      <span className="sr-only">{OMR_COPY.dropFormats}</span>
    </>
  );
}

/** Friendly score + notes motif — Piece Studio only (no OSMD / VexFlow). */
function DropzoneStaffMotif() {
  return (
    <svg
      className="musai-piece-drop__motif-svg musai-file-import__motif-svg"
      viewBox="0 0 160 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <clipPath id="musai-piece-drop-page-clip">
          <rect x="16" y="12" width="128" height="96" rx="24" />
        </clipPath>
      </defs>

      <rect
        x="16"
        y="12"
        width="128"
        height="96"
        rx="24"
        className="musai-piece-drop__motif-page"
      />

      <g clipPath="url(#musai-piece-drop-page-clip)">
        <g
          className="musai-piece-drop__motif-staff"
          strokeWidth="1.55"
          strokeLinecap="round"
        >
          <path d="M36 34h88" />
          <path d="M36 46h88" />
          <path d="M36 58h88" />
          <path d="M36 70h88" />
          <path d="M36 82h88" />
        </g>

        {/*
          One quaver: filled head, stem, and flag as a single glyph so the
          tail is attached to the stem (no floating beam / extra stem).
        */}
        <g
          className="musai-piece-drop__motif-notes"
          fill="currentColor"
          transform="translate(52 12) scale(1.18)"
        >
          <ellipse
            cx="13"
            cy="50"
            rx="11"
            ry="7.8"
            transform="rotate(-22 13 50)"
          />
          <rect x="22" y="8" width="2.3" height="42" rx="1.1" />
          <path d="M24.3 8c8.5 1.2 13.2 7.2 12.2 16.2-1.4 12.4-10.4 16.8-12.2 17.6V36c3.2-1.4 7.6-5.2 8.4-12.2.7-6.2-2.6-10.4-8.4-11.2V8z" />
        </g>
      </g>
    </svg>
  );
}
