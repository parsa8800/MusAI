"use client";

import { useEffect, useState } from "react";
import { OMR_COPY } from "@/features/piece-studio/omr/omrProvider";
import {
  readPieceOriginalFile,
  readPieceRecognizedMusicXml,
} from "@/features/piece-studio/pieceStudioFiles";
import type { PieceWorkspaceV1 } from "@/features/piece-studio/pieceStudioTypes";
import type { PiecePlaybackTimeListener } from "@/features/piece-studio/playback/playbackTime";
import { OsmdScoreAdapter, type PieceScoreHighlight } from "@/features/piece-studio/score/OsmdScoreAdapter";
import { musicXmlFromBytes } from "@/features/piece-studio/score/musicXmlSource";

function EmptyStaves() {
  return (
    <div className="musai-piece-staves" aria-hidden>
      <span />
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

/**
 * Central digital-score stage. MusicXML (imported or read from a page) is
 * drawn by the OSMD adapter. PDF and images fall back to the original file.
 *
 * When `embedded`, piece identity is owned by the workspace chrome so the
 * notation can use the full stage.
 */
export function PieceScorePaper({
  piece,
  embedded = false,
  followPlayback = false,
  subscribePlaybackTime,
  getPlaybackTime,
  wholeNotesToSeconds,
  onSeekFromScore,
  playbackNotes,
  highlight = null,
  onHighlightSelect,
}: {
  piece: PieceWorkspaceV1;
  embedded?: boolean;
  followPlayback?: boolean;
  subscribePlaybackTime?: (listener: PiecePlaybackTimeListener) => () => void;
  getPlaybackTime?: () => number;
  wholeNotesToSeconds?: (wholeNotes: number) => number;
  onSeekFromScore?: (tSec: number) => void;
  playbackNotes?: readonly { startSec: number; endSec: number }[];
  highlight?: PieceScoreHighlight | null;
  onHighlightSelect?: (id: string) => void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [musicXml, setMusicXml] = useState<string | null>(null);
  const [xmlError, setXmlError] = useState<string | null>(null);
  const [xmlLoading, setXmlLoading] = useState(true);
  const [showOriginal, setShowOriginal] = useState(false);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    setMusicXml(null);
    setXmlError(null);
    setObjectUrl(null);
    setXmlLoading(true);

    void (async () => {
      const recognized = await readPieceRecognizedMusicXml(piece.pieceId);
      if (cancelled) return;
      if (recognized) {
        setMusicXml(recognized);
        setXmlLoading(false);
      }

      if (!piece.hasOriginalFile) {
        if (!recognized && !cancelled) setXmlLoading(false);
        return;
      }

      const blob = await readPieceOriginalFile(piece.pieceId);
      if (cancelled || !blob) {
        if (!cancelled && !recognized) setXmlLoading(false);
        return;
      }

      const visual = piece.sourceKind === "pdf" || piece.sourceKind === "image";
      if (visual) {
        const url = URL.createObjectURL(blob);
        revoked = url;
        if (!cancelled) setObjectUrl(url);
      }

      if (!recognized && piece.sourceKind === "musicxml") {
        try {
          const xml = musicXmlFromBytes(
            await blob.arrayBuffer(),
            piece.sourceFileName,
          );
          if (!cancelled) setMusicXml(xml);
        } catch {
          if (!cancelled) setXmlError("Couldn’t read this score file.");
        }
      }

      if (!cancelled) setXmlLoading(false);
    })();

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [piece.pieceId, piece.hasOriginalFile, piece.sourceKind, piece.sourceFileName]);

  const bits: string[] = [];
  if (piece.composer?.trim()) bits.push(piece.composer.trim());
  if (piece.score.keySignature) bits.push(piece.score.keySignature);
  if (piece.score.timeSignature) bits.push(piece.score.timeSignature);
  if (piece.score.tempoBpm) bits.push(`${piece.score.tempoBpm} bpm`);
  const visual = piece.sourceKind === "pdf" || piece.sourceKind === "image";
  const canToggleOriginal = Boolean(musicXml && objectUrl && visual);
  const showPage = visual && objectUrl && (showOriginal || !musicXml);
  const recognized = piece.recognitionStatus === "ready";
  const failed = piece.recognitionStatus === "failed";
  const awaitingConfirm = recognized && !piece.recognitionConfirmed;
  const showToolbar =
    (awaitingConfirm && musicXml && !showOriginal) ||
    (failed && visual) ||
    canToggleOriginal;

  return (
    <div
      className={
        embedded ? "musai-piece-score musai-piece-score--embedded" : "musai-piece-score"
      }
    >
      {!embedded ? (
        <div className="musai-piece-score__head">
          <h2 className="musai-piece-score__title font-display">{piece.title}</h2>
          {bits.length > 0 ? (
            <p className="musai-piece-score__meta">{bits.join(" · ")}</p>
          ) : null}
        </div>
      ) : null}

      {showToolbar ? (
        <div className="musai-piece-score__toolbar">
          {awaitingConfirm && musicXml && !showOriginal ? (
            <p className="musai-piece-score__confirm">{OMR_COPY.confirm}</p>
          ) : null}
          {failed && visual ? (
            <p className="musai-piece-score__confirm" role="status">
              {piece.recognitionMessage ?? OMR_COPY.failed}
            </p>
          ) : null}
          {canToggleOriginal ? (
            <button
              type="button"
              className="musai-piece-score__toggle"
              onClick={() => setShowOriginal((v) => !v)}
            >
              {showOriginal ? OMR_COPY.showDigital : OMR_COPY.showOriginal}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="musai-piece-score__stage">
        {showPage ? (
          piece.sourceKind === "pdf" ? (
            <object
              className="musai-piece-score__page"
              data={objectUrl ?? undefined}
              type="application/pdf"
              aria-label={`${piece.title} score`}
            >
              <a href={objectUrl ?? "#"} className="musai-piece-score__fallback">
                Open the score
              </a>
            </object>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="musai-piece-score__page musai-piece-score__page--image"
              src={objectUrl ?? ""}
              alt={`${piece.title} score`}
            />
          )
        ) : musicXml ? (
          <OsmdScoreAdapter
            musicXml={musicXml}
            title={piece.title}
            followPlayback={followPlayback && !showOriginal}
            subscribePlaybackTime={subscribePlaybackTime}
            getPlaybackTime={getPlaybackTime}
            wholeNotesToSeconds={wholeNotesToSeconds}
            onSeek={onSeekFromScore}
            playbackNotes={playbackNotes}
            highlight={followPlayback || showOriginal ? null : highlight}
            onHighlightSelect={onHighlightSelect}
          />
        ) : (
          <>
            {xmlError ? (
              <p className="musai-piece-osmd-error" role="status">
                {xmlError}
              </p>
            ) : xmlLoading ? (
              <p className="musai-piece-osmd-status" role="status">
                Drawing the score…
              </p>
            ) : null}
            {xmlLoading ? null : <EmptyStaves />}
          </>
        )}
      </div>
    </div>
  );
}

export { pieceIdentityMeta } from "@/features/piece-studio/pieceIdentityMeta";
