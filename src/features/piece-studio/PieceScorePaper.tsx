"use client";

import { useEffect, useState } from "react";
import { OMR_COPY } from "@/features/piece-studio/omr/omrProvider";
import {
  readPieceOriginalFile,
  readPieceRecognizedMusicXml,
} from "@/features/piece-studio/pieceStudioFiles";
import type { PieceWorkspaceV1 } from "@/features/piece-studio/pieceStudioTypes";
import type { PiecePlaybackTimeListener } from "@/features/piece-studio/playback/playbackTime";
import {
  OsmdScoreAdapter,
  type PieceScoreHighlight,
} from "@/features/piece-studio/score/OsmdScoreAdapter";
import type { PitchNoteMark } from "@/features/piece-studio/feedback/visual/piecePitchScoreMap";
import type { DynamicLetterMark } from "@/features/piece-studio/feedback/visual/pieceDynamicsScoreMap";
import { musicXmlFromBytes } from "@/features/piece-studio/score/musicXmlSource";
import { sanitizeMusicXmlDynamics } from "@/features/piece-studio/score/sanitizeMusicXmlDynamics";
import { prepareMusicXmlForEngraving } from "@/features/piece-studio/score/prepareMusicXmlForEngraving";

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
 * Central score stage. MusicXML (imported or read from a page) is drawn by
 * the OSMD adapter. A scan is shown only when there is no digital score yet.
 *
 * When `embedded`, piece identity is owned by the workspace chrome so the
 * notation can use the full stage.
 */
export function PieceScorePaper({
  piece,
  embedded = false,
  followPlayback = false,
  showPlayhead = false,
  subscribePlaybackTime,
  getPlaybackTime,
  wholeNotesToSeconds,
  onSeekFromScore,
  onLoopMark,
  loopSpan = null,
  loopPicking = false,
  onScrubPreview,
  onScrubCommit,
  getPlaying,
  playbackNotes,
  highlight = null,
  highlights = null,
  pitchMarks = null,
  dynamicMarks = null,
  onHighlightSelect,
  onScoreOpen,
}: {
  piece: PieceWorkspaceV1;
  embedded?: boolean;
  followPlayback?: boolean;
  /** Shared score playhead (Listen + Practise). Independent of Listen layout. */
  showPlayhead?: boolean;
  subscribePlaybackTime?: (listener: PiecePlaybackTimeListener) => () => void;
  getPlaybackTime?: () => number;
  wholeNotesToSeconds?: (wholeNotes: number) => number;
  onSeekFromScore?: (tSec: number) => void;
  /** While choosing a loop, score taps set the start bar, then the end bar. */
  onLoopMark?: (tSec: number) => void;
  loopSpan?: { startSec: number; endSec: number } | null;
  loopPicking?: boolean;
  onScrubPreview?: (tSec: number) => void;
  onScrubCommit?: (tSec: number, resume: boolean) => void;
  getPlaying?: () => boolean;
  playbackNotes?: readonly { startSec: number; endSec: number }[];
  highlight?: PieceScoreHighlight | null;
  highlights?: readonly PieceScoreHighlight[] | null;
  /** Pitch notehead colour map (Practise). */
  pitchMarks?: readonly PitchNoteMark[] | null;
  /** Written dynamic letters that were too loud or too soft. */
  dynamicMarks?: readonly DynamicLetterMark[] | null;
  onHighlightSelect?: (id: string) => void;
  /** Fires once the score module is mounted (Listen waits on this plus the piano). */
  onScoreOpen?: () => void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [musicXml, setMusicXml] = useState<string | null>(null);
  const [xmlError, setXmlError] = useState<string | null>(null);
  const [xmlLoading, setXmlLoading] = useState(true);

  useEffect(() => {
    onScoreOpen?.();
  }, [onScoreOpen]);

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
        // PDF/photo OMR merges need engraving scrub before OSMD; digital
        // MusicXML imports only need dynamics cleanup.
        const forDisplay =
          piece.sourceKind === "pdf" || piece.sourceKind === "image"
            ? prepareMusicXmlForEngraving(recognized)
            : recognized;
        setMusicXml(sanitizeMusicXmlDynamics(forDisplay));
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

  const visual = piece.sourceKind === "pdf" || piece.sourceKind === "image";
  const preferDigital =
    Boolean(piece.recognitionConfirmed) || piece.sourceKind === "musicxml";
  const showPage =
    visual && objectUrl && !musicXml && !preferDigital && !xmlLoading;
  const recognized = piece.recognitionStatus === "ready";
  const failed = piece.recognitionStatus === "failed";
  const awaitingConfirm = recognized && !piece.recognitionConfirmed;
  const showToolbar = (awaitingConfirm && Boolean(musicXml)) || (failed && visual);

  return (
    <div
      className={
        embedded ? "musai-piece-score musai-piece-score--embedded" : "musai-piece-score"
      }
    >
      {!embedded ? (
        <div className="musai-piece-score__head">
          <h2 className="musai-piece-score__title font-display">{piece.title}</h2>
        </div>
      ) : null}

      {showToolbar ? (
        <div className="musai-piece-score__toolbar">
          {awaitingConfirm && musicXml ? (
            <p className="musai-piece-score__confirm">{OMR_COPY.confirm}</p>
          ) : null}
          {failed && visual ? (
            <p className="musai-piece-score__confirm" role="status">
              {piece.recognitionMessage ?? OMR_COPY.failed}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="musai-piece-score__stage">
        {showPage ? (
          piece.sourceKind === "pdf" ? (
            <iframe
              className="musai-piece-score__page musai-piece-score__page--pdf"
              src={objectUrl ? `${objectUrl}#toolbar=0&navpanes=0&view=FitH` : undefined}
              title={`${piece.title} original score`}
            />
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
            followPlayback={followPlayback}
            showPlayhead={showPlayhead || followPlayback}
            subscribePlaybackTime={subscribePlaybackTime}
            getPlaybackTime={getPlaybackTime}
            wholeNotesToSeconds={wholeNotesToSeconds}
            onSeek={onSeekFromScore}
            onLoopMark={onLoopMark}
            loopSpan={loopSpan}
            loopPicking={loopPicking}
            onScrubPreview={onScrubPreview}
            onScrubCommit={onScrubCommit}
            getPlaying={getPlaying}
            playbackNotes={playbackNotes}
            highlight={followPlayback ? null : highlight}
            highlights={followPlayback ? null : highlights}
            pitchMarks={followPlayback ? null : pitchMarks}
            dynamicMarks={followPlayback ? null : dynamicMarks}
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
