"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MusaiSegmentedControl } from "@/components/MusaiSegmentedControl";
import { MusaiSplitPane } from "@/components/MusaiSplitPane";
import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import { StudioViewport } from "@/components/StudioViewport";
import { PieceListenControls } from "@/features/piece-studio/playback/PieceListenControls";
import {
  secondsAtQuarter,
} from "@/features/piece-studio/playback/playbackTimeline";
import { usePiecePlayback } from "@/features/piece-studio/playback/usePiecePlayback";
import { pieceIdentityLines } from "@/features/piece-studio/pieceIdentityMeta";
import {
  getPieceWorkspaceBySlug,
  touchPieceWorkspace,
} from "@/features/piece-studio/pieceStudioCatalog";
import {
  buildPieceCoachContext,
} from "@/features/piece-studio/feedback/pieceCoachContext";
import {
  coachIssueById,
  coachIssuesFromFocus,
  coachIssuesFromMock,
  type PieceCoachIssueView,
} from "@/features/piece-studio/feedback/visual/pieceCoachIssueView";
import {
  readPieceFeedbackReport,
  readPieceOriginalFile,
  readPieceRecognizedMusicXml,
  readPieceStructuredScore,
} from "@/features/piece-studio/pieceStudioFiles";
import { PIECE_STUDIO_HREF } from "@/features/piece-studio/pieceStudioRoutes";
import {
  MUSAI_PIECE_PRACTISE_SCORE_MAX_RATIO,
  MUSAI_PIECE_PRACTISE_SCORE_MIN_RATIO,
  MUSAI_PIECE_PRACTISE_SCORE_RATIO,
  MUSAI_PIECE_PRACTISE_SPLIT_KEY,
} from "@/features/piece-studio/practice/piecePractiseLayout";
import { musicXmlFromBytes } from "@/features/piece-studio/score/musicXmlSource";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";
import type { MusaiScoreV1 } from "@/features/piece-studio/score/musaiScore";
import {
  isPieceWorkspaceView,
  type PieceWorkspaceV1,
  type PieceWorkspaceView,
} from "@/features/piece-studio/pieceStudioTypes";
import { tapFeedback } from "@/lib/motion";

const PieceScorePaper = dynamic(
  () =>
    import("@/features/piece-studio/PieceScorePaper").then((m) => ({
      default: m.PieceScorePaper,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="musai-piece-score musai-piece-score--embedded">
        <p className="musai-piece-score__hint">Opening score…</p>
      </div>
    ),
  },
);

const PiecePractiseDock = dynamic(
  () =>
    import("@/features/piece-studio/practice/PiecePractiseDock").then((m) => ({
      default: m.PiecePractiseDock,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="musai-piece-dock">
        <p className="musai-piece-dock__copy">Opening practise…</p>
      </div>
    ),
  },
);

const PieceFeedbackReview = dynamic(
  () =>
    import("@/features/piece-studio/feedback/visual/PieceFeedbackReview").then(
      (m) => ({ default: m.PieceFeedbackReview }),
    ),
  { ssr: false },
);

const VIEW_OPTIONS: { value: PieceWorkspaceView; label: string }[] = [
  { value: "score", label: "Score" },
  { value: "listen", label: "Listen" },
  { value: "practise", label: "Practise" },
];

function PieceWorkspaceShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <StudioViewport>
      <div className="musai-piece-workspace">
        <header className="musai-piece-workspace__nav flex shrink-0 items-center gap-2 px-0 py-2 sm:gap-3 sm:py-2.5">
          <PracticeHubBackLink
            className="!mb-0 shrink-0"
            href={PIECE_STUDIO_HREF}
            label="Piece studio"
            ariaLabel="Back to Piece studio"
          />
        </header>
        {children}
      </div>
    </StudioViewport>
  );
}

/** First paint only — must match SSR (no localStorage yet). */
function PieceWorkspaceOpening() {
  return (
    <PieceWorkspaceShell>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <div
          className="h-10 w-10 rounded-full border-2 border-[var(--musai-border)] border-t-[var(--musai-accent)] motion-safe:animate-spin motion-reduce:animate-none"
          aria-hidden
        />
        <p className="text-sm text-[var(--musai-muted)]">Opening piece…</p>
      </div>
    </PieceWorkspaceShell>
  );
}

function PieceWorkspaceMissing({ slug }: { slug: string }) {
  return (
    <PieceWorkspaceShell>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-[var(--musai-muted)]">
          “{slug}” isn’t in your library. Import it again from Piece studio.
        </p>
        <Link href={PIECE_STUDIO_HREF} className="musai-btn-primary">
          Piece studio
        </Link>
      </div>
    </PieceWorkspaceShell>
  );
}

function AudioListenDock({
  objectUrl,
  title,
}: {
  objectUrl: string | null;
  title: string;
}) {
  if (objectUrl) {
    return (
      <div className="musai-piece-dock">
        <p className="musai-piece-dock__label">Reference</p>
        <audio className="musai-piece-audio" controls src={objectUrl} aria-label={`Listen to ${title}`}>
          Your browser can’t play this audio.
        </audio>
      </div>
    );
  }
  return (
    <div className="musai-piece-dock">
      <p className="musai-piece-dock__copy">No reference audio for this piece yet.</p>
    </div>
  );
}

function listenUnavailable(
  piece: PieceWorkspaceV1,
  ready: boolean,
  structured: MusaiScoreV1 | null | undefined,
): string | null {
  if (piece.sourceKind === "audio") return null;
  if (structured === undefined) return "Preparing playback…";
  if (ready) return null;
  if (piece.recognitionStatus === "failed") {
    return "Playback needs a digital score. Your original page is still saved.";
  }
  if (piece.sourceKind === "pdf" || piece.sourceKind === "image") {
    return "Playback follows a digital score. We’ll play it once the page can be read.";
  }
  return "This score doesn’t have timing to play yet.";
}

/**
 * Persistent piece workspace. Score / Listen / Practise are views of one page.
 */
export function PieceWorkspaceView({ slug }: { slug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("view");
  const [catalogTick, setCatalogTick] = useState(0);
  /** undefined = catalog not read yet (SSR + first client paint must match). */
  const [piece, setPiece] = useState<PieceWorkspaceV1 | null | undefined>(
    undefined,
  );
  const [view, setView] = useState<PieceWorkspaceView>(() =>
    requested && isPieceWorkspaceView(requested) ? requested : "score",
  );
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [structured, setStructured] = useState<MusaiScoreV1 | null | undefined>(
    undefined,
  );
  const [practiseBusy, setPractiseBusy] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [preferSampleFeedback, setPreferSampleFeedback] = useState(false);
  const [liveCoachIssues, setLiveCoachIssues] = useState<PieceCoachIssueView[]>(
    [],
  );
  const [liveCoachReady, setLiveCoachReady] = useState(false);
  const playback = usePiecePlayback(structured ?? null, {
    loadInstrument: view === "listen",
  });
  const timelineRef = useRef(playback.timeline);
  timelineRef.current = playback.timeline;
  const [sampleIssues, setSampleIssues] = useState<PieceCoachIssueView[]>([]);
  const latestAttempt = piece?.attempts.at(-1) ?? null;
  const hasLiveCoach = Boolean(
    latestAttempt && liveCoachReady && liveCoachIssues.length > 0,
  );
  const usingSamplePrototype = preferSampleFeedback || !hasLiveCoach;
  const coachIssues = usingSamplePrototype ? sampleIssues : liveCoachIssues;
  const previewIssue = coachIssueById(coachIssues, previewId);
  const showPreview =
    view === "practise" && !practiseBusy && coachIssues.length > 0;

  const highlight = useMemo(() => {
    if (!showPreview || !previewIssue) return null;
    return {
      id: previewIssue.id,
      startWholeNotes: previewIssue.startWholeNotes,
      endWholeNotes: previewIssue.endWholeNotes,
      label: previewIssue.where,
      source: previewIssue.source,
      visualTone: previewIssue.visualTone,
      visualStyle: previewIssue.visualStyle,
    };
  }, [showPreview, previewIssue]);

  const wholeNotesToSeconds = useCallback((wholeNotes: number) => {
    const tl = timelineRef.current;
    if (!tl) return wholeNotes * 4 * (60 / 100);
    return secondsAtQuarter(tl.tempoSpans, wholeNotes * 4);
  }, []);

  const onHighlightSelect = useCallback((id: string) => {
    tapFeedback("medium");
    setPreviewId(id);
  }, []);

  const togglePlayback = playback.toggle;
  const restartPlayback = playback.restart;

  const onTogglePlayback = useCallback(() => {
    tapFeedback("medium");
    togglePlayback();
  }, [togglePlayback]);

  const onRestartPlayback = useCallback(() => {
    tapFeedback("light");
    restartPlayback();
  }, [restartPlayback]);

  useEffect(() => {
    setPiece(getPieceWorkspaceBySlug(slug));
  }, [slug, catalogTick]);

  useEffect(() => {
    if (!piece) {
      setLiveCoachIssues([]);
      setLiveCoachReady(false);
      return;
    }
    const attempt = piece.attempts.at(-1);
    if (!attempt) {
      setLiveCoachIssues([]);
      setLiveCoachReady(false);
      return;
    }
    let cancelled = false;
    setLiveCoachReady(false);
    void readPieceFeedbackReport(piece.pieceId, attempt.attemptId).then(
      (report) => {
        if (cancelled) return;
        if (!report) {
          setLiveCoachIssues([]);
          setLiveCoachReady(true);
          return;
        }
        const ctx = buildPieceCoachContext(report);
        setLiveCoachIssues(coachIssuesFromFocus(ctx.focus));
        setLiveCoachReady(true);
        setPreviewId(ctx.focus[0]?.eventId ?? null);
      },
    );
    return () => {
      cancelled = true;
    };
    // piece already refreshes on catalogTick — avoid a duplicate IDB read.
  }, [piece]);

  const scoreLoadKey =
    piece === undefined ? "loading" : piece === null ? "missing" : piece.pieceId;
  const audioLoadKey = `${scoreLoadKey}:${piece?.sourceKind ?? ""}:${piece?.hasOriginalFile ? "1" : "0"}`;

  useEffect(() => {
    if (view !== "practise" || !structured) {
      setSampleIssues([]);
      return;
    }
    let cancelled = false;
    void import(
      "@/features/piece-studio/feedback/visual/mockPieceFeedbackPreview"
    ).then((mod) => {
      if (cancelled) return;
      setSampleIssues(
        coachIssuesFromMock(mod.mockPieceFeedbackIssues(structured)),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [view, structured]);

  useEffect(() => {
    if (!piece) return;
    const next =
      requested && isPieceWorkspaceView(requested) ? requested : piece.lastView;
    setView(next);
    touchPieceWorkspace(piece.pieceId, next);
    // Only re-sync view when the piece identity or URL view changes — not every catalog tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece?.pieceId, requested]);

  useEffect(() => {
    if (scoreLoadKey === "loading") return;
    if (scoreLoadKey === "missing") {
      setStructured(null);
      return;
    }
    const workspace = getPieceWorkspaceBySlug(slug);
    if (!workspace || workspace.pieceId !== scoreLoadKey) {
      setStructured(null);
      return;
    }
    const pieceId = workspace.pieceId;
    const title = workspace.title;
    const sourceKind = workspace.sourceKind;
    const hasOriginalFile = workspace.hasOriginalFile;
    const sourceFileName = workspace.sourceFileName;
    let cancelled = false;
    void (async () => {
      let score = await readPieceStructuredScore(pieceId);
      if (!score) {
        const recognized = await readPieceRecognizedMusicXml(pieceId);
        if (recognized) {
          try {
            score = parseMusicXmlToScore(recognized, title);
          } catch {
            score = null;
          }
        }
      }
      if (!score && sourceKind === "musicxml" && hasOriginalFile) {
        const blob = await readPieceOriginalFile(pieceId);
        if (blob) {
          try {
            const xml = musicXmlFromBytes(
              await blob.arrayBuffer(),
              sourceFileName,
            );
            score = parseMusicXmlToScore(xml, title);
          } catch {
            score = null;
          }
        }
      }
      if (!cancelled) setStructured(score);
    })();
    return () => {
      cancelled = true;
    };
  }, [scoreLoadKey, slug]);

  useEffect(() => {
    if (scoreLoadKey === "loading" || scoreLoadKey === "missing") {
      setAudioUrl(null);
      return;
    }
    const workspace = getPieceWorkspaceBySlug(slug);
    if (
      !workspace ||
      workspace.pieceId !== scoreLoadKey ||
      workspace.sourceKind !== "audio" ||
      !workspace.hasOriginalFile
    ) {
      setAudioUrl(null);
      return;
    }
    const pieceId = workspace.pieceId;
    let revoked: string | null = null;
    let cancelled = false;
    void readPieceOriginalFile(pieceId).then((blob) => {
      if (cancelled || !blob) return;
      const url = URL.createObjectURL(blob);
      revoked = url;
      setAudioUrl(url);
    });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [audioLoadKey, scoreLoadKey, slug]);

  useEffect(() => {
    if (view !== "listen") playback.pause();
    if (view !== "practise") {
      setPractiseBusy(false);
    }
    // Pause when leaving Listen; playback identity is stable enough here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    const first = coachIssues[0]?.id ?? null;
    setPreviewId((current) =>
      current && coachIssues.some((issue) => issue.id === current)
        ? current
        : first,
    );
  }, [coachIssues]);

  const playbackNoteTimes = useMemo(
    () =>
      playback.timeline?.notes.map((n) => ({
        startSec: n.startSec,
        endSec: n.endSec,
      })) ?? undefined,
    [playback.timeline],
  );

  if (piece === undefined) {
    return <PieceWorkspaceOpening />;
  }
  if (!piece) {
    return <PieceWorkspaceMissing slug={slug} />;
  }

  const setWorkspaceView = (next: PieceWorkspaceView) => {
    if (next === view) return;
    tapFeedback("light");
    // Flip the tab immediately; persist + URL after the frame so input never
    // waits behind catalog writes.
    setView(next);
    const pieceId = piece.pieceId;
    const slug = piece.slug;
    window.queueMicrotask(() => {
      touchPieceWorkspace(pieceId, next);
      router.replace(`${PIECE_STUDIO_HREF}/${slug}?view=${next}`, {
        scroll: false,
      });
    });
  };

  const listening = view === "listen";
  const practising = view === "practise";
  const identity = pieceIdentityLines(piece);

  // Stable fiber: same score column across Score / Listen / Practise (dock toggles).
  const scorePaper = (
    <PieceScorePaper
      key={piece.pieceId}
      piece={piece}
      embedded
      followPlayback={listening && playback.scoreReady}
      subscribePlaybackTime={playback.subscribeTime}
      getPlaybackTime={playback.getCurrentSec}
      wholeNotesToSeconds={wholeNotesToSeconds}
      onSeekFromScore={playback.seek}
      playbackNotes={playbackNoteTimes}
      highlight={highlight}
      onHighlightSelect={onHighlightSelect}
    />
  );

  const practiseCoach = (
    <div
      className="musai-piece-workspace__support"
      data-testid="piece-practise-support"
    >
      <div className="musai-piece-workspace__support-main">
        {showPreview ? (
          <PieceFeedbackReview
            issues={coachIssues}
            activeId={previewIssue?.id ?? null}
            onActiveId={setPreviewId}
            onShowOnScore={setPreviewId}
          />
        ) : practiseBusy ? (
          <p className="musai-piece-workspace__support-idle" role="status">
            Recording…
          </p>
        ) : latestAttempt && liveCoachReady ? (
          <p className="musai-piece-workspace__support-idle">
            No focus this take — try again when you like.
          </p>
        ) : (
          <p className="musai-piece-workspace__support-idle">
            Record a take when you’re ready.
          </p>
        )}
        {hasLiveCoach ? (
          <button
            type="button"
            className="musai-pressable musai-piece-workspace__sample-toggle"
            data-testid="piece-sample-feedback-toggle"
            onClick={() => {
              tapFeedback("light");
              setPreferSampleFeedback((on) => !on);
            }}
          >
            {preferSampleFeedback ? "Your take" : "Sample"}
          </button>
        ) : null}
      </div>
    </div>
  );

  // Same outer fiber across Score / Listen / Practise so OSMD is not remounted.
  const scoreColumn = (
    <div
      className="musai-piece-workspace__practise-stage"
      data-practise={practising ? "true" : "false"}
    >
      <div className="musai-piece-workspace__stage">{scorePaper}</div>
      {practising ? (
        <PiecePractiseDock
          piece={piece}
          structured={structured}
          onAttemptSaved={() => setCatalogTick((n) => n + 1)}
          onBusyChange={setPractiseBusy}
        />
      ) : null}
    </div>
  );

  return (
    <StudioViewport>
      <div
        className={
          practising
            ? "musai-piece-workspace musai-piece-workspace--practise"
            : listening
              ? "musai-piece-workspace musai-piece-workspace--listen"
              : "musai-piece-workspace"
        }
      >
        <header className="musai-piece-workspace__nav flex shrink-0 items-center gap-2 px-0 py-2 sm:gap-3 sm:py-2.5">
          <PracticeHubBackLink
            className="!mb-0 shrink-0"
            href={PIECE_STUDIO_HREF}
            label="Piece studio"
            ariaLabel="Back to Piece studio"
          />
        </header>

        <div className="musai-piece-workspace__identity">
          <h1 className="musai-piece-workspace__title font-display">{piece.title}</h1>
          {identity.metaLine ? (
            <p className="musai-piece-workspace__meta">{identity.metaLine}</p>
          ) : null}
        </div>

        <div className="musai-piece-workspace__modes">
          <MusaiSegmentedControl
            ariaLabel="Piece workspace"
            value={view}
            onChange={setWorkspaceView}
            options={VIEW_OPTIONS}
            size="compact"
            className="musai-piece-workspace__tabs"
          />
        </div>

        <div className="musai-piece-workspace__body">
          <MusaiSplitPane
            storageKey={
              practising ? MUSAI_PIECE_PRACTISE_SPLIT_KEY : undefined
            }
            fixedRatio={
              practising ? MUSAI_PIECE_PRACTISE_SCORE_RATIO : 1
            }
            minRatio={
              practising ? MUSAI_PIECE_PRACTISE_SCORE_MIN_RATIO : 1
            }
            maxRatio={
              practising ? MUSAI_PIECE_PRACTISE_SCORE_MAX_RATIO : 1
            }
            resizable={practising}
            leftClassName="musai-piece-workspace__score-pane"
            rightClassName="musai-piece-workspace__coach-pane md:min-w-[16rem]"
            left={scoreColumn}
            right={practising ? practiseCoach : null}
          />
        </div>

        {listening ? (
          <div className="musai-piece-workspace__dock">
            {piece.sourceKind === "audio" ? (
              <AudioListenDock objectUrl={audioUrl} title={piece.title} />
            ) : (
              <PieceListenControls
                ready={playback.scoreReady}
                playing={playback.playing}
                durationSec={playback.durationSec}
                bpm={playback.bpm}
                baseBpm={playback.baseBpm}
                speedPreset={playback.speedPreset}
                metronomeOn={playback.metronomeOn}
                loop={playback.loop}
                measureCount={playback.measureCount}
                unavailable={listenUnavailable(
                  piece,
                  playback.scoreReady,
                  structured,
                )}
                instrumentStatus={playback.instrumentStatus}
                subscribeTime={playback.subscribeTime}
                getCurrentSec={playback.getCurrentSec}
                onToggle={onTogglePlayback}
                onRestart={onRestartPlayback}
                onSeek={playback.seek}
                onScrubPreview={playback.scrubPreview}
                onBpm={playback.setBpm}
                onSpeedPreset={playback.setSpeedPreset}
                onToggleMetronome={playback.toggleMetronome}
                onLoopChange={playback.setLoop}
                onLoopCurrentMeasure={playback.loopCurrentMeasure}
                onSeekToMeasure={playback.seekToMeasure}
              />
            )}
          </div>
        ) : null}
      </div>
    </StudioViewport>
  );
}
