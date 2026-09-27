/**
 * Shared file-accept / size helpers for MusAI import surfaces.
 *
 * ## Future studios / trainers
 *
 * Do **not** implement drag-and-drop or file-picker wiring from scratch.
 *
 * 1. Prefer the React surface {@link MusaiFileImport} from
 *    `@/components/MusaiFileImport` for any visible import / drop zone.
 * 2. Always run click + drop through {@link filterMusaiImportFiles} before
 *    feature-specific processing (`importPieceFromFile`, analyze, detect, …).
 * 3. Pass the feature’s existing accept string (or a preset below) — do not
 *    invent overlapping accept lists.
 * 4. Compact toolbar icon buttons may keep custom chrome, but must still call
 *    {@link filterMusaiImportFiles} (and ideally the same `onFileSelected`
 *    handler used by click) so validation stays consistent.
 *
 * Click and drag-and-drop must share one gate — never fork processing by input method.
 */

/** Common audio accept list (Scale Studio, Note Trainer / capture dock). */
export const MUSAI_AUDIO_UPLOAD_ACCEPT =
  "audio/*,.wav,.mp3,.m4a,.ogg,.webm,.flac" as const;

/**
 * Piece Practise take import — preserves the historical accept list (no `.flac`).
 * Prefer {@link MUSAI_AUDIO_UPLOAD_ACCEPT} for new audio-import surfaces.
 */
export const MUSAI_PIECE_PRACTISE_AUDIO_ACCEPT =
  "audio/*,.mp3,.wav,.m4a,.ogg,.webm" as const;

/** Piece Studio unified score accept (PDF / image / digital score). */
export const MUSAI_SCORE_UPLOAD_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.musicxml,.xml,.mxl,application/pdf,image/png,image/jpeg,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml,application/xml,text/xml" as const;

export type MusaiAcceptToken = {
  /** Lowercase extension without dot, e.g. "pdf". */
  extension: string | null;
  /** Lowercase MIME or MIME prefix ending in `/` or `/*` pattern. */
  mime: string | null;
  /** True when token is a wildcard like `audio/*` or `image/*`. */
  mimeWildcard: boolean;
};

export type MusaiImportRejectReason =
  | "empty"
  | "type"
  | "size"
  | "too-many"
  | "disabled";

export type MusaiImportFilterResult = {
  accepted: File[];
  rejected: File[];
  reason: MusaiImportRejectReason | null;
  message: string | null;
};

export type MusaiImportFilterOptions = {
  accept?: string;
  maxSizeBytes?: number;
  multiple?: boolean;
  maxFiles?: number;
};

const REJECT_COPY: Record<MusaiImportRejectReason, string> = {
  empty: "Choose a file to import.",
  type: "That file type isn’t supported here.",
  size: "That file is too large.",
  "too-many": "Too many files at once.",
  disabled: "Import isn’t available right now.",
};

export function parseMusaiAccept(accept: string | undefined | null): MusaiAcceptToken[] {
  if (!accept?.trim()) return [];
  return accept
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .map((token): MusaiAcceptToken => {
      if (token.startsWith(".")) {
        return { extension: token.slice(1), mime: null, mimeWildcard: false };
      }
      if (token.endsWith("/*")) {
        return {
          extension: null,
          mime: token.slice(0, -1),
          mimeWildcard: true,
        };
      }
      return { extension: null, mime: token, mimeWildcard: false };
    });
}

export function fileExtension(name: string): string {
  const base = name.trim().toLowerCase();
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1);
}

export function fileMatchesMusaiAccept(
  file: Pick<File, "name" | "type">,
  accept: string | undefined | null,
): boolean {
  const tokens = parseMusaiAccept(accept);
  if (tokens.length === 0) return true;

  const ext = fileExtension(file.name);
  const mime = (file.type || "").toLowerCase();

  return tokens.some((token) => {
    if (token.extension && ext === token.extension) return true;
    if (!token.mime) return false;
    if (token.mimeWildcard) {
      return mime.startsWith(token.mime);
    }
    return mime === token.mime;
  });
}

/**
 * Best-effort check while dragging. Browsers often omit filenames until drop;
 * MIME types on DataTransferItem are used when present.
 * Returns `"unknown"` when we cannot decide (treat as valid drag affordance).
 */
export function dataTransferMatchesMusaiAccept(
  dataTransfer: DataTransfer | null | undefined,
  accept: string | undefined | null,
): boolean | "unknown" {
  const tokens = parseMusaiAccept(accept);
  if (tokens.length === 0) return true;
  if (!dataTransfer) return "unknown";

  const items = [...(dataTransfer.items ?? [])].filter(
    (item) => item.kind === "file",
  );
  if (items.length === 0) {
    const types = [...(dataTransfer.types ?? [])];
    if (types.includes("Files")) return "unknown";
    return false;
  }

  let sawTyped = false;
  let anyMatch = false;
  for (const item of items) {
    const mime = (item.type || "").toLowerCase();
    if (!mime) continue;
    sawTyped = true;
    const fake = { name: "", type: mime };
    if (fileMatchesMusaiAccept(fake, accept)) anyMatch = true;
  }
  if (!sawTyped) return "unknown";
  return anyMatch;
}

export function musaiImportRejectMessage(
  reason: MusaiImportRejectReason,
  options?: { maxSizeBytes?: number; maxFiles?: number },
): string {
  if (reason === "size" && options?.maxSizeBytes) {
    const mb = Math.max(1, Math.round(options.maxSizeBytes / (1024 * 1024)));
    return `That file is too large (max ${mb} MB).`;
  }
  if (reason === "too-many" && options?.maxFiles) {
    return options.maxFiles === 1
      ? "Import one file at a time."
      : `You can import up to ${options.maxFiles} files.`;
  }
  return REJECT_COPY[reason];
}

/**
 * Single gate for click + drop. Always run this before feature processing.
 */
export function filterMusaiImportFiles(
  list: ArrayLike<File> | File[] | null | undefined,
  options: MusaiImportFilterOptions = {},
): MusaiImportFilterResult {
  const files = list ? Array.from(list as ArrayLike<File>) : [];
  if (files.length === 0) {
    return {
      accepted: [],
      rejected: [],
      reason: "empty",
      message: musaiImportRejectMessage("empty"),
    };
  }

  const multiple = Boolean(options.multiple);
  const maxFiles = options.maxFiles ?? (multiple ? Number.POSITIVE_INFINITY : 1);
  if (files.length > maxFiles) {
    return {
      accepted: [],
      rejected: files,
      reason: "too-many",
      message: musaiImportRejectMessage("too-many", { maxFiles }),
    };
  }

  const accepted: File[] = [];
  const rejected: File[] = [];
  let reason: MusaiImportRejectReason | null = null;

  for (const file of files) {
    if (!fileMatchesMusaiAccept(file, options.accept)) {
      rejected.push(file);
      reason = reason ?? "type";
      continue;
    }
    if (
      typeof options.maxSizeBytes === "number" &&
      options.maxSizeBytes > 0 &&
      file.size > options.maxSizeBytes
    ) {
      rejected.push(file);
      reason = reason ?? "size";
      continue;
    }
    accepted.push(file);
  }

  if (accepted.length === 0) {
    return {
      accepted: [],
      rejected,
      reason: reason ?? "type",
      message: musaiImportRejectMessage(reason ?? "type", {
        maxSizeBytes: options.maxSizeBytes,
        maxFiles,
      }),
    };
  }

  return {
    accepted: multiple ? accepted : accepted.slice(0, 1),
    rejected,
    reason: null,
    message: null,
  };
}

/** Build a stable HTML `accept` attribute from tokens / preset string. */
export function musaiAcceptAttribute(
  accept: string | undefined | null,
): string | undefined {
  const trimmed = accept?.trim();
  return trimmed || undefined;
}
