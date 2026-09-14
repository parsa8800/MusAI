"use client";

import { useId, useRef, useState, type DragEvent, type RefObject } from "react";
import { PIECE_STUDIO_UPLOAD_ACCEPT } from "@/features/piece-studio/pieceStudioImport";
import { OMR_COPY } from "@/features/piece-studio/omr/omrProvider";

/**
 * One seamless import surface for every Piece Studio format.
 * Routing (OMR vs direct MusicXML) stays inside importPieceFromFile.
 */
export function PieceImportDropzone({
  busy = false,
  busyLabel,
  disabled = false,
  onFile,
  inputRef,
}: {
  busy?: boolean;
  busyLabel?: string | null;
  disabled?: boolean;
  onFile: (file: File) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const autoId = useId();
  const localRef = useRef<HTMLInputElement>(null);
  const fileRef = inputRef ?? localRef;
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const locked = disabled || busy;

  const takeFile = (file: File | undefined) => {
    if (!file || locked) return;
    onFile(file);
  };

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (locked) return;
    dragDepth.current += 1;
    setDragging(true);
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (locked) return;
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  };

  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDragging(false);
    if (locked) return;
    takeFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div
      className={[
        "musai-piece-drop",
        dragging ? "musai-piece-drop--active" : "",
        busy ? "musai-piece-drop--busy" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="piece-import-dropzone"
      data-dragging={dragging ? "true" : undefined}
      data-busy={busy ? "true" : undefined}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <label
        htmlFor={autoId}
        className="musai-piece-drop__body musai-pressable"
        aria-disabled={locked || undefined}
      >
        {busy && busyLabel ? (
          <>
            <span className="musai-piece-drop__title">{busyLabel}</span>
            <span className="musai-piece-drop__hint sr-only">
              {OMR_COPY.dropFormats}
            </span>
          </>
        ) : (
          <>
            <span className="musai-piece-drop__title">{OMR_COPY.dropMusic}</span>
            <span className="musai-piece-drop__hint">{OMR_COPY.dropFormats}</span>
          </>
        )}
        <input
          id={autoId}
          ref={fileRef}
          type="file"
          accept={PIECE_STUDIO_UPLOAD_ACCEPT}
          className="sr-only"
          disabled={locked}
          aria-label={OMR_COPY.importMusic}
          onChange={(e) => {
            takeFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}
