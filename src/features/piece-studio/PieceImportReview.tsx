"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MusaiLoadingMark } from "@/components/MusaiLoadingMark";
import { OMR_COPY } from "@/features/piece-studio/omr/omrProvider";
import { measureWholeNoteSpan } from "@/features/piece-studio/omr/assessRecognitionHints";
import type { PieceImportDraft } from "@/features/piece-studio/pieceStudioImport";
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

type ReviewMode = "reading" | "preparing" | "ready" | "failed";

/**
 * Upload gate: Reading → Preparing score → Ready (confirm) | Failed.
 * The engraved score is the only preview. Confirm is enabled only after it
 * has visibly rendered. Until confirm, the upload is a temporary draft.
 */
export function PieceImportReview({
  draft,
  processing = false,
  processingLabel,
  progress,
  onConfirm,
  onTryAgain,
  onChooseAnotherFile,
}: {
  draft: PieceImportDraft | null;
  /** Full-screen reading state before the draft exists. */
  processing?: boolean;
  processingLabel?: string;
  /** 0–100 for the file being turned into MusicXML. */
  progress?: number;
  onConfirm: (title: string) => void;
  onTryAgain: () => void;
  onChooseAnotherFile: () => void;
}) {
  const sessionId = draft?.sessionId ?? null;
  const sourceKind = draft?.sourceKind;
  const recognizedXml = draft?.musicXml ?? null;
  const musicXml = useMemo(() => {
    if (!recognizedXml) return null;
    if (sourceKind === "pdf" || sourceKind === "image") {
      return prepareMusicXmlForEngraving(recognizedXml);
    }
    return recognizedXml;
  }, [recognizedXml, sourceKind]);
  const structured = draft?.structured ?? null;

  const paintGateKey = `${sessionId ?? "none"}:${draft?.recognitionStatus ?? "none"}:${musicXml ? musicXml.length : 0}`;
  const [paintGate, setPaintGate] = useState<{
    key: string;
    state: ScorePaintState;
  }>({ key: paintGateKey, state: "preparing" });
  const paintState: ScorePaintState =
    paintGate.key === paintGateKey ? paintGate.state : "preparing";

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
          progress={progress}
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
                <ImportLoadingCompact
                  label={OMR_COPY.preparingScore}
                  progress={progress}
                />
              </div>
            ) : null}

            <DigitalScorePreview
              title={title || "Piece"}
              musicXml={musicXml}
              highlight={mode === "ready" ? focusHighlight : null}
              onPaintState={onPaintState}
            />
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
        <FailedNotice
          title={failedNoticeTitle(displayFailed, draft?.recognitionMessage)}
          lead={failedNoticeLead(displayFailed, draft?.recognitionMessage)}
          onChooseAnotherFile={() => {
            tapFeedback("light");
            onChooseAnotherFile();
          }}
        />
      ) : null}
    </div>
  );
}

function ImportLoadingLayout({
  title,
  label,
  tip,
  progress,
}: {
  title: string;
  label: string;
  tip?: string;
  progress?: number;
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
        <MusaiLoadingMark progress={progress} progressLabel="Uploading the piece" />
      </div>
    </div>
  );
}

function ImportLoadingCompact({
  label,
  progress,
}: {
  label: string;
  progress?: number;
}) {
  return (
    <div
      className="musai-piece-import-review__processing"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <span className="musai-piece-import-review__a11y">{label}</span>
      <MusaiLoadingMark
        compact
        progress={progress}
        progressLabel="Uploading the piece"
      />
    </div>
  );
}

/** Engraved score — the only preview after a photo, PDF, or MusicXML upload. */
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

function failedNoticeTitle(
  displayFailed: boolean,
  message: string | null | undefined,
): string {
  if (displayFailed) return OMR_COPY.displayFailedTitle;
  if (message === OMR_COPY.scanningUnavailable) return OMR_COPY.scanningUnavailable;
  return OMR_COPY.failedTitle;
}

function failedNoticeLead(
  displayFailed: boolean,
  message: string | null | undefined,
): string | null {
  if (displayFailed) return null;
  if (message === OMR_COPY.scanningUnavailable) {
    return OMR_COPY.scanningUnavailableLead;
  }
  const text = message?.trim() ?? "";
  if (!text || text === OMR_COPY.failed || text === OMR_COPY.failedTitle) {
    return null;
  }
  return text;
}

function FailedNotice({
  title,
  lead,
  onChooseAnotherFile,
}: {
  title: string;
  lead: string | null;
  onChooseAnotherFile: () => void;
}) {
  return (
    <div className="musai-piece-import-review__quiet-fail">
      <h1 className="musai-piece-import-review__title font-display">{title}</h1>
      {lead ? (
        <p className="musai-piece-import-review__lead" role="status">
          {lead}
        </p>
      ) : null}
      <button
        type="button"
        className="musai-pressable musai-btn-primary musai-piece-import-review__quiet-action"
        data-testid="piece-import-choose-another"
        onClick={onChooseAnotherFile}
      >
        {OMR_COPY.chooseAnotherFile}
      </button>
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

