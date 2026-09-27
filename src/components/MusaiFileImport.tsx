"use client";

import {
  useId,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  dataTransferMatchesMusaiAccept,
  filterMusaiImportFiles,
  musaiAcceptAttribute,
} from "@/lib/musaiFileImport";

export type MusaiFileImportProps = {
  /**
   * HTML accept string (MIME + extensions), e.g. `audio/*,.wav,.mp3`.
   * Alias of {@link acceptedFiles}.
   */
  accept?: string;
  /** Preferred alias for studios configuring allowed types. */
  acceptedFiles?: string;
  /** Called for click and drop with the same filtered file list. */
  onFilesSelected: (files: File[]) => void;
  /**
   * Optional validation reject callback (type / size / too-many).
   * Prefer wiring this into the same error channel the parent already shows.
   */
  onReject?: (message: string) => void;
  processing?: boolean;
  processingLabel?: string;
  /** Controlled error message shown under / inside the surface. */
  error?: string | null;
  /** Controlled success message (e.g. “Ready”). */
  success?: string | null;
  disabled?: boolean;
  /** Primary label, e.g. “Add music” or “Import audio”. */
  label?: string;
  /** Secondary hint, e.g. “PDF, image, or digital score”. */
  hint?: string;
  /** Accessible name for the file input (defaults to label). */
  inputAriaLabel?: string;
  multiple?: boolean;
  maxFiles?: number;
  maxSizeBytes?: number;
  /** Quieter, shorter target for crowded layouts. */
  compact?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  className?: string;
  /** Optional motif / icon above the title. */
  motif?: ReactNode;
  testId?: string;
};

type DragKind = "none" | "valid" | "invalid";

function resolveAccept(props: Pick<MusaiFileImportProps, "accept" | "acceptedFiles">) {
  return props.acceptedFiles ?? props.accept ?? "";
}

/**
 * Shared MusAI file import surface — click and drag-and-drop share one gate.
 *
 * ## Standard for future MusAI file import
 *
 * New studios / trainers that need file import should use this component
 * (or `MusaiCaptureDock`, which embeds it) instead of hand-rolling
 * `onDrop` / `<input type="file">` logic.
 *
 * Minimal reuse:
 * ```tsx
 * <MusaiFileImport
 *   acceptedFiles={MUSAI_AUDIO_UPLOAD_ACCEPT} // or your feature accept string
 *   label="Import audio"
 *   hint="Drop a file or tap to choose"
 *   processing={busy}
 *   error={error}
 *   onFilesSelected={(files) => process(files[0]!)}
 *   onReject={setError}
 * />
 * ```
 *
 * Feature code should only process files from `onFilesSelected` after this
 * component’s shared filter (type / size / count). Do not add a second
 * drop handler beside it.
 *
 * @see filterMusaiImportFiles
 * @see MUSAI_AUDIO_UPLOAD_ACCEPT
 */
export function MusaiFileImport({
  accept,
  acceptedFiles,
  onFilesSelected,
  onReject,
  processing = false,
  processingLabel = "Reading…",
  error = null,
  success = null,
  disabled = false,
  label = "Drop a file here",
  hint,
  inputAriaLabel,
  multiple = false,
  maxFiles,
  maxSizeBytes,
  compact = false,
  inputRef,
  className = "",
  motif,
  testId = "musai-file-import",
}: MusaiFileImportProps) {
  const autoId = useId();
  const localRef = useRef<HTMLInputElement>(null);
  const fileRef = inputRef ?? localRef;
  const dragDepth = useRef(0);
  const [dragKind, setDragKind] = useState<DragKind>("none");

  const acceptValue = resolveAccept({ accept, acceptedFiles });
  const acceptAttr = musaiAcceptAttribute(acceptValue);
  const locked = disabled || processing;

  const visualState = (() => {
    if (processing) return "processing";
    if (error) return "error";
    if (success) return "success";
    if (dragKind === "valid") return "drag-valid";
    if (dragKind === "invalid") return "drag-invalid";
    return "idle";
  })();

  const takeFiles = (list: ArrayLike<File> | File[] | null | undefined) => {
    if (locked) {
      onReject?.("Import isn’t available right now.");
      return;
    }
    const result = filterMusaiImportFiles(list, {
      accept: acceptValue,
      maxSizeBytes,
      multiple,
      maxFiles,
    });
    if (result.accepted.length === 0) {
      if (result.message) onReject?.(result.message);
      return;
    }
    onFilesSelected(result.accepted);
  };

  const clearDrag = () => {
    dragDepth.current = 0;
    setDragKind("none");
  };

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (locked) return;
    dragDepth.current += 1;
    const match = dataTransferMatchesMusaiAccept(e.dataTransfer, acceptValue);
    setDragKind(match === false ? "invalid" : "valid");
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (locked) return;
    const match = dataTransferMatchesMusaiAccept(e.dataTransfer, acceptValue);
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = match === false ? "none" : "copy";
    }
    setDragKind(match === false ? "invalid" : "valid");
  };

  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragKind("none");
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    clearDrag();
    if (locked) return;
    takeFiles(e.dataTransfer.files);
  };

  const onKeyActivate = (e: KeyboardEvent) => {
    if (locked) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    fileRef.current?.click();
  };

  const title = processing ? processingLabel : label;
  const showHint = Boolean(hint) && !processing;
  const statusMessage = !processing ? error || success || null : null;

  return (
    <div
      className={[
        "musai-file-import",
        compact ? "musai-file-import--compact" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid={testId}
      data-state={visualState}
      data-disabled={locked ? "true" : undefined}
      data-compact={compact ? "true" : undefined}
      data-multiple={multiple ? "true" : undefined}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div
        role="button"
        tabIndex={locked ? -1 : 0}
        className="musai-file-import__body musai-pressable"
        aria-disabled={locked || undefined}
        aria-busy={processing || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={statusMessage ? `${autoId}-status` : undefined}
        aria-label={label}
        onKeyDown={onKeyActivate}
        onClick={() => {
          if (locked) return;
          fileRef.current?.click();
        }}
      >
        {motif ? (
          <span className="musai-file-import__motif" aria-hidden>
            {motif}
          </span>
        ) : (
          <span className="musai-file-import__motif" aria-hidden>
            <DefaultImportMotif />
          </span>
        )}

        <span className="musai-file-import__title">{title}</span>
        {showHint ? (
          <span className="musai-file-import__hint">{hint}</span>
        ) : null}
        {processing ? (
          <span className="sr-only" role="status">
            {processingLabel}
          </span>
        ) : null}

        <input
          id={autoId}
          ref={fileRef}
          type="file"
          accept={acceptAttr}
          className="sr-only"
          disabled={locked}
          multiple={multiple}
          tabIndex={-1}
          aria-label={inputAriaLabel ?? label}
          onChange={(e) => {
            takeFiles(e.target.files);
            e.target.value = "";
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {statusMessage ? (
        <p
          id={`${autoId}-status`}
          className={
            error
              ? "musai-file-import__status musai-file-import__status--error"
              : "musai-file-import__status musai-file-import__status--success"
          }
          role={error ? "alert" : "status"}
        >
          {statusMessage}
        </p>
      ) : null}
    </div>
  );
}

function DefaultImportMotif() {
  return (
    <svg
      className="musai-file-import__motif-svg"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect
        x="8"
        y="6"
        width="32"
        height="36"
        rx="8"
        className="musai-file-import__motif-page"
      />
      <path
        d="M24 16v14M17 23l7-7 7 7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
