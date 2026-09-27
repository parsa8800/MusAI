"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MusaiLoadingMark } from "@/components/MusaiLoadingMark";
import { MusaiSegmentedControl } from "@/components/MusaiSegmentedControl";
import { OMR_COPY } from "@/features/piece-studio/omr/omrProvider";
import { measureWholeNoteSpan } from "@/features/piece-studio/omr/assessRecognitionHints";
import type { PieceImportDraft } from "@/features/piece-studio/pieceStudioImport";
import type { PieceSourceKind } from "@/features/piece-studio/pieceStudioTypes";
import {
  OsmdScoreAdapter,
  type PieceScoreHighlight,
  type ScorePaintState,
} from "@/features/piece-studio/score/OsmdScoreAdapter";
import { prepareMusicXmlForEngraving } from "@/features/piece-studio/score/prepareMusicXmlForEngraving";
import { musicXmlPreviewLog } from "@/features/piece-studio/score/scoreViewport";
import { PieceNameControl } from "@/features/piece-studio/PieceNameControl";
import { recommendedPieceTitle } from "@/features/piece-studio/pieceTitle";
import { tapFeedback } from "@/lib/motion";

type OriginalKind = "pdf" | "image" | "other";
type ComparePane = "original" | "score";
type ReviewMode = "reading" | "preparing" | "ready" | "failed";

/**
 * Upload gate: Reading → Preparing score → Ready (confirm) | Failed.
 * Confirm is enabled only after the digital score has visibly rendered.
 * Until confirm, the upload is a temporary draft — never a library piece.
 */
export function PieceImportReview({
  draft,
  processing = false,
  processingLabel,
  onConfirm,
  onTryAgain,
  onChooseAnotherFile,
}: {
  draft: PieceImportDraft | null;
  /** Full-screen reading state before the draft exists. */
  processing?: boolean;
  processingLabel?: string;
  onConfirm: (title: string) => void;
  onTryAgain: () => void;
  onChooseAnotherFile: () => void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [originalKind, setOriginalKind] = useState<OriginalKind>("other");
  const [pane, setPane] = useState<ComparePane>("score");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);

  const sessionId = draft?.sessionId ?? null;
  const sourceKind = draft?.sourceKind;
  const sourceMimeType = draft?.sourceMimeType;
  const recognizedXml = draft?.musicXml ?? null;
  const musicXml = useMemo(() => {
    if (!recognizedXml) return null;
    if (sourceKind === "pdf" || sourceKind === "image") {
      return prepareMusicXmlForEngraving(recognizedXml);
    }
    return recognizedXml;
  }, [recognizedXml, sourceKind]);
  const structured = draft?.structured ?? null;
  const file = draft?.file ?? null;

  const paintGateKey = `${sessionId ?? "none"}:${draft?.recognitionStatus ?? "none"}:${musicXml ? musicXml.length : 0}`;
  const [paintGate, setPaintGate] = useState<{
    key: string;
    state: ScorePaintState;
  }>({ key: paintGateKey, state: "preparing" });
  const paintState: ScorePaintState =
    paintGate.key === paintGateKey ? paintGate.state : "preparing";

  useEffect(() => {
    if (!file || processing) return;
    let revoked: string | null = null;
    let cancelled = false;
    void (async () => {
      const kind = await classifyOriginalBlob(
        file,
        sourceKind ?? "image",
        sourceMimeType,
      );
      if (cancelled) return;
      setOriginalKind(kind);
      const url = URL.createObjectURL(file);
      revoked = url;
      setObjectUrl(url);
      if (kind === "pdf") {
        try {
          const pages = countPdfPages(await file.arrayBuffer());
          if (!cancelled) setPageCount(pages);
        } catch {
          if (!cancelled) setPageCount(1);
        }
      } else if (!cancelled) {
        setPageCount(1);
      }
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [sessionId, processing, sourceKind, sourceMimeType, file]);

  const recognitionFailed =
    !processing && draft?.recognitionStatus === "failed";
  const displayFailed =
    !processing &&
    draft?.recognitionStatus === "ready" &&
    Boolean(musicXml) &&
    paintState === "failed";
  const failed = recognitionFailed || displayFailed;

  const scoreParsed =
    !processing &&
    draft?.recognitionStatus === "ready" &&
    Boolean(musicXml);

  const scoreVisible = scoreParsed && paintState === "ready";

  const mode: ReviewMode = processing
    ? "reading"
    : failed
      ? "failed"
      : scoreVisible
        ? "ready"
        : scoreParsed
          ? "preparing"
          : "reading";

  const focusMeasure =
    typeof draft?.recognitionFocusMeasure === "number"
      ? draft.recognitionFocusMeasure
      : null;
  const uncertain = scoreVisible && focusMeasure != null;

  const focusHighlight = useMemo((): PieceScoreHighlight | null => {
    if (!uncertain || focusMeasure == null || !structured) return null;
    const span = measureWholeNoteSpan(structured, focusMeasure);
    if (!span) return null;
    return {
      id: `recognition-focus-${focusMeasure}`,
      startWholeNotes: span.startWholeNotes,
      endWholeNotes: span.endWholeNotes,
      label: OMR_COPY.checkSection,
      visualStyle: "measure",
      visualTone: "pitch",
    };
  }, [uncertain, focusMeasure, structured]);

  const title = draft?.title?.trim() || null;
  const suggestion = useMemo(
    () =>
      recommendedPieceTitle({
        fileName: draft?.sourceFileName,
        scoreTitle: draft?.structured?.title ?? draft?.title,
        musicXml: draft?.musicXml,
      }),
    [draft?.sourceFileName, draft?.structured?.title, draft?.title, draft?.musicXml],
  );
  const nameRef = useRef(title ?? "");
  const rememberName = useCallback((name: string) => {
    nameRef.current = name;
  }, []);
  const readingLabel = processingLabel || OMR_COPY.reading;
  const isDigitalSource = sourceKind === "musicxml";
  const showPageNav =
    !isDigitalSource &&
    originalKind === "pdf" &&
    pageCount > 1 &&
    (mode === "failed" || pane === "original");

  const onPaintState = (state: ScorePaintState) => {
    setPaintGate((prev) => {
      if (prev.key === paintGateKey && prev.state === state) return prev;
      return { key: paintGateKey, state };
    });
  };

  return (
    <div
      className="musai-piece-import-review"
      data-testid="piece-import-review"
      data-state={mode}
      data-source={sourceKind ?? "unknown"}
      data-paint={scoreParsed ? paintState : undefined}
    >
      {mode === "reading" ? (
        <ImportLoadingLayout
          title={OMR_COPY.openingScore}
          label={readingLabel}
          tip={OMR_COPY.readingPatience}
        />
      ) : null}

      {scoreParsed && !failed ? (
        <>
          <header className="musai-piece-import-review__head">
            {title ? (
              <PieceNameControl
                title={title}
                suggestion={suggestion}
                onName={rememberName}
              />
            ) : null}
            {mode === "ready" && uncertain ? (
              <p
                className="musai-piece-import-review__hint"
                role="status"
                data-testid="piece-import-check-section"
              >
                {OMR_COPY.checkSection}
              </p>
            ) : null}
          </header>

          {/*
            Always paint in this laid-out stage (never opacity:0 / absolute).
            Preparing is an overlay so OSMD sees the same width users will see.
          */}
          <div
            className="musai-piece-import-review__stage musai-piece-import-review__stage--preview"
            data-preparing={mode === "preparing" ? "true" : undefined}
            data-testid="piece-import-preview-stage"
          >
            {mode === "preparing" ? (
              <div
                className="musai-piece-import-review__prepare-overlay"
                role="status"
                data-testid="piece-import-paint-host"
              >
                <ImportLoadingCompact label={OMR_COPY.preparingScore} />
              </div>
            ) : null}

            {isDigitalSource ? (
              <DigitalScorePreview
                title={title || "Piece"}
                musicXml={musicXml}
                highlight={mode === "ready" ? focusHighlight : null}
                onPaintState={onPaintState}
              />
            ) : (
              <ReadyCompare
                pane={pane}
                onPaneChange={setPane}
                objectUrl={objectUrl}
                kind={originalKind}
                title={title || "Piece"}
                musicXml={musicXml}
                highlight={mode === "ready" ? focusHighlight : null}
                pageIndex={pageIndex}
                pageCount={pageCount}
                showPageNav={mode === "ready" && showPageNav}
                onPageChange={setPageIndex}
                onPaintState={onPaintState}
              />
            )}
          </div>

          <div
            className="musai-piece-import-review__decide"
            data-ready={mode === "ready" ? "true" : undefined}
          >
            <div className="musai-piece-import-review__actions">
              {mode === "ready" ? (
                <button
                  type="button"
                  className="musai-pressable musai-btn-primary musai-piece-import-review__primary"
                  data-testid="piece-import-confirm"
                  onClick={() => {
                    tapFeedback("medium");
                    onConfirm(nameRef.current);
                  }}
                >
                  {OMR_COPY.looksGood}
                </button>
              ) : null}
              <button
                type="button"
                className="musai-pressable musai-piece-import-review__secondary"
                data-testid="piece-import-try-again"
                onClick={() => {
                  tapFeedback("light");
                  onTryAgain();
                }}
              >
                {OMR_COPY.tryAgain}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {mode === "failed" ? (
        <>
          <header className="musai-piece-import-review__head">
            <h1 className="musai-piece-import-review__title font-display">
              {displayFailed
                ? OMR_COPY.displayFailedTitle
                : draft?.recognitionMessage === OMR_COPY.scanningUnavailable
                  ? OMR_COPY.scanningUnavailable
                  : OMR_COPY.failedTitle}
            </h1>
            {!displayFailed &&
            draft?.recognitionMessage === OMR_COPY.scanningUnavailable ? (
              <p className="musai-piece-import-review__lead" role="status">
                {OMR_COPY.scanningUnavailableLead}
              </p>
            ) : null}
          </header>

          <div className="musai-piece-import-review__stage">
            {displayFailed || isDigitalSource ? (
              recognitionFailed &&
              draft?.recognitionMessage &&
              draft.recognitionMessage !== OMR_COPY.scanningUnavailable ? (
                <p className="musai-piece-import-review__lead" role="status">
                  {draft.recognitionMessage}
                </p>
              ) : null
            ) : draft?.recognitionMessage === OMR_COPY.scanningUnavailable ? (
              null
            ) : objectUrl ? (
              <FailedPreview
                objectUrl={objectUrl}
                kind={originalKind}
                title={title || "Upload"}
                pageIndex={pageIndex}
                pageCount={pageCount}
                showPageNav={showPageNav}
                onPageChange={setPageIndex}
              />
            ) : null}
          </div>

          <div className="musai-piece-import-review__decide" data-ready="true">
            <div className="musai-piece-import-review__actions">
              <button
                type="button"
                className="musai-pressable musai-btn-primary musai-piece-import-review__primary"
                data-testid="piece-import-try-again"
                onClick={() => {
                  tapFeedback("light");
                  onTryAgain();
                }}
              >
                {displayFailed || isDigitalSource
                  ? OMR_COPY.tryAgain
                  : OMR_COPY.tryAnotherImage}
              </button>
              <button
                type="button"
                className="musai-pressable musai-piece-import-review__secondary"
                data-testid="piece-import-choose-another"
                onClick={() => {
                  tapFeedback("light");
                  onChooseAnotherFile();
                }}
              >
                {OMR_COPY.chooseAnotherFile}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ImportLoadingLayout({
  title,
  label,
  tip,
}: {
  title: string;
  label: string;
  tip?: string;
}) {
  // Visible UI is wordless; keep copy for assistive tech only.
  void tip;
  const a11y = [title, label].filter(Boolean).join(". ");
  return (
    <div
      className="musai-piece-import-review__loading"
      data-testid="piece-import-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={a11y}
    >
      <span className="musai-piece-import-review__a11y">{a11y}</span>
      <div className="musai-piece-import-review__loading-stage">
        <MusaiLoadingMark />
      </div>
    </div>
  );
}

function ImportLoadingCompact({ label }: { label: string }) {
  return (
    <div
      className="musai-piece-import-review__processing"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <span className="musai-piece-import-review__a11y">{label}</span>
      <MusaiLoadingMark compact />
    </div>
  );
}

/** Direct MusicXML/MXL — score preview only (no Original compare). */
function DigitalScorePreview({
  title,
  musicXml,
  highlight,
  onPaintState,
}: {
  title: string;
  musicXml: string | null;
  highlight: PieceScoreHighlight | null;
  onPaintState: (state: ScorePaintState) => void;
}) {
  useEffect(() => {
    if (!musicXml) return;
    musicXmlPreviewLog("PREVIEW_RENDER_START", {
      where: "DigitalScorePreview mount",
      title,
      xmlChars: musicXml.length,
      hasScorePartwise: musicXml.includes("score-partwise"),
    });
  }, [musicXml, title]);

  return (
    <div
      className="musai-piece-import-review__compare musai-piece-import-review__compare--digital"
      data-testid="piece-import-digital-preview"
    >
      <div className="musai-piece-import-review__frame" data-pane="score">
        <div
          className="musai-piece-import-review__pane"
          data-active="true"
          aria-hidden={false}
        >
          {musicXml ? (
            <OsmdScoreAdapter
              musicXml={musicXml}
              title={title}
              highlight={highlight}
              onPaintState={onPaintState}
              showInlineError={false}
              paintPurpose="import-preview"
            />
          ) : (
            <QuietEmpty />
          )}
        </div>
      </div>
    </div>
  );
}

function ReadyCompare({
  pane,
  onPaneChange,
  objectUrl,
  kind,
  title,
  musicXml,
  highlight,
  pageIndex,
  pageCount,
  showPageNav,
  onPageChange,
  onPaintState,
}: {
  pane: ComparePane;
  onPaneChange: (pane: ComparePane) => void;
  objectUrl: string | null;
  kind: OriginalKind;
  title: string;
  musicXml: string | null;
  highlight: PieceScoreHighlight | null;
  pageIndex: number;
  pageCount: number;
  showPageNav: boolean;
  onPageChange: (page: number) => void;
  onPaintState: (state: ScorePaintState) => void;
}) {
  return (
    <div className="musai-piece-import-review__compare">
      <MusaiSegmentedControl
        ariaLabel="Compare"
        size="compact"
        className="musai-piece-import-review__segmented"
        value={pane}
        onChange={onPaneChange}
        options={[
          { value: "original" as const, label: OMR_COPY.originalLabel },
          { value: "score" as const, label: OMR_COPY.musaiScoreLabel },
        ]}
      />

      <div className="musai-piece-import-review__frame" data-pane={pane}>
        <div
          className="musai-piece-import-review__pane"
          data-active={pane === "original" ? "true" : "false"}
          aria-hidden={pane !== "original"}
        >
          {objectUrl ? (
            <OriginalPagePreview
              url={objectUrl}
              kind={kind}
              title={title}
              pageIndex={pageIndex}
            />
          ) : (
            <QuietEmpty />
          )}
        </div>
        <div
          className="musai-piece-import-review__pane"
          data-active={pane === "score" ? "true" : "false"}
          aria-hidden={pane !== "score"}
        >
          {musicXml ? (
            <OsmdScoreAdapter
              musicXml={musicXml}
              title={title}
              highlight={highlight}
              onPaintState={onPaintState}
              showInlineError={false}
              paintPurpose="import-preview"
            />
          ) : (
            <QuietEmpty />
          )}
        </div>
      </div>

      {showPageNav ? (
        <PageNav
          pageIndex={pageIndex}
          pageCount={pageCount}
          onChange={onPageChange}
        />
      ) : null}
    </div>
  );
}

function FailedPreview({
  objectUrl,
  kind,
  title,
}: {
  objectUrl: string;
  kind: OriginalKind;
  title: string;
  pageIndex: number;
  pageCount: number;
  showPageNav: boolean;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="musai-piece-import-review__fail">
      <div className="musai-piece-import-review__frame musai-piece-import-review__frame--fail">
        <div className="musai-piece-import-review__fail-page">
          <p className="musai-piece-import-review__fail-copy">
            {OMR_COPY.failed}
          </p>
          <a
            href={objectUrl}
            className="musai-piece-import-review__fallback"
            target="_blank"
            rel="noreferrer"
          >
            {kind === "pdf"
              ? "Open original PDF"
              : kind === "image"
                ? "Open original image"
                : `Open ${title}`}
          </a>
        </div>
      </div>
    </div>
  );
}

/** Minimal placeholder — never a large empty card. */
function QuietEmpty() {
  return (
    <div className="musai-piece-import-review__quiet" role="status">
      {OMR_COPY.emptyPreview}
    </div>
  );
}

function PageNav({
  pageIndex,
  pageCount,
  onChange,
}: {
  pageIndex: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="musai-piece-import-review__pages" aria-label="Pages">
      <button
        type="button"
        className="musai-pressable musai-piece-import-review__page-btn"
        disabled={pageIndex <= 0}
        aria-label="Previous page"
        onClick={() => {
          tapFeedback("light");
          onChange(Math.max(0, pageIndex - 1));
        }}
      >
        ‹
      </button>
      <span className="musai-piece-import-review__page-label">
        {pageIndex + 1} / {pageCount}
      </span>
      <button
        type="button"
        className="musai-pressable musai-piece-import-review__page-btn"
        disabled={pageIndex >= pageCount - 1}
        aria-label="Next page"
        onClick={() => {
          tapFeedback("light");
          onChange(Math.min(pageCount - 1, pageIndex + 1));
        }}
      >
        ›
      </button>
    </div>
  );
}

function OriginalPagePreview({
  url,
  kind,
  title,
  pageIndex,
}: {
  url: string;
  kind: OriginalKind;
  title: string;
  pageIndex: number;
}) {
  if (kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="musai-piece-import-review__media musai-piece-import-review__media--image"
        src={url}
        alt={`${title} original`}
      />
    );
  }

  if (kind === "pdf") {
    const src = `${url}#page=${pageIndex + 1}&view=FitH`;
    return (
      <iframe
        className="musai-piece-import-review__media musai-piece-import-review__media--pdf"
        src={src}
        title={`${title} page ${pageIndex + 1}`}
      />
    );
  }

  return (
    <a
      href={url}
      className="musai-piece-import-review__fallback"
      target="_blank"
      rel="noreferrer"
    >
      Open file
    </a>
  );
}

/** Best-effort page count for simple PDFs (enough for navigation). */
function countPdfPages(buffer: ArrayBuffer): number {
  const text = new TextDecoder("latin1").decode(buffer);
  const matches = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g);
  return Math.max(1, matches?.length ?? 1);
}

async function classifyOriginalBlob(
  blob: Blob,
  sourceKind: PieceSourceKind,
  sourceMimeType: string | null | undefined,
): Promise<OriginalKind> {
  const mime = (blob.type || sourceMimeType || "").toLowerCase();
  if (mime.includes("pdf")) return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (sourceKind === "pdf") return "pdf";
  if (sourceKind === "image") return "image";

  try {
    const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    if (
      head[0] === 0x25 &&
      head[1] === 0x50 &&
      head[2] === 0x44 &&
      head[3] === 0x46
    ) {
      return "pdf";
    }
    if (
      head[0] === 0x89 &&
      head[1] === 0x50 &&
      head[2] === 0x4e &&
      head[3] === 0x47
    ) {
      return "image";
    }
    if (head[0] === 0xff && head[1] === 0xd8) return "image";
  } catch {
    /* keep other */
  }
  return "other";
}
