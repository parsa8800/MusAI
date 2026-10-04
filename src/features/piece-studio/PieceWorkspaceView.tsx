"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MusaiSegmentedControl } from "@/components/MusaiSegmentedControl";
import { MusaiSplitPane } from "@/components/MusaiSplitPane";
import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import { StudioCoachLauncher } from "@/components/StudioCoachLauncher";
import { StudioViewport } from "@/components/StudioViewport";
import {
  PiecePrepareMark,
} from "@/features/piece-studio/PiecePrepareMark";
import { MusaiLoadingMark } from "@/components/MusaiLoadingMark";
import { PieceListenControls } from "@/features/piece-studio/playback/PieceListenControls";
import { PieceNameControl } from "@/features/piece-studio/PieceNameControl";
import { recommendedPieceTitle } from "@/features/piece-studio/pieceTitle";
import { PieceScorePdfButton } from "@/features/piece-studio/score/PieceScorePdfButton";
import { listenUnavailable } from "@/features/piece-studio/listenUnavailable";
import {
  loopBoundsSec,
  secondsAtQuarter,
} from "@/features/piece-studio/playback/playbackTimeline";
import { usePiecePlayback } from "@/features/piece-studio/playback/usePiecePlayback";
import { useInstrument } from "@/components/InstrumentProvider";
import type { PiecePlayheadClock } from "@/features/piece-studio/playback/htmlMediaClock";
import {
  getPieceWorkspaceBySlug,
  renamePieceTitle,
  touchPieceWorkspace,
} from "@/features/piece-studio/pieceStudioCatalog";
import {
  buildPieceCoachContext,
} from "@/features/piece-studio/feedback/pieceCoachContext";
import {
  coachIssueById,
  coachIssuesFromEvents,
  collapsePieceCoachIssues,
  type PieceCoachIssueView,
} from "@/features/piece-studio/feedback/visual/pieceCoachIssueView";
import { PieceAskCoach } from "@/features/piece-studio/feedback/visual/PieceAskCoach";
import { PieceRhythmHighlightPopup } from "@/features/piece-studio/feedback/visual/PieceRhythmHighlightPopup";
import {
  readCoachMemory,
  writeCoachOpen,
} from "@/lib/coachThreadMemory";
import type { PieceAskContext } from "@/features/piece-studio/feedback/visual/pieceCoachChat";
import { pitchMarksFromTake } from "@/features/piece-studio/feedback/visual/piecePitchScoreMap";
import { dynamicLetterMarksFromIssues } from "@/features/piece-studio/feedback/visual/pieceDynamicsScoreMap";
import {
  rhythmHighlightExplanation,
  rhythmHighlightsFromIssues,
  rhythmRunForIssueId,
} from "@/features/piece-studio/feedback/visual/pieceRhythmScoreMap";
import { isGeneratedPieceSampleRecording } from "@/features/piece-studio/practice/synthesizePieceSampleTake";
import type { PiecePitchNoteV1 } from "@/features/piece-studio/feedback/pieceFeedbackTypes";
import type { PieceScoreHighlight } from "@/features/piece-studio/score/OsmdScoreAdapter";
import {
  pieceFeedbackSpanWholeNotes,
} from "@/features/piece-studio/feedback/visual/pieceFeedbackAnnotation";
import {
  readPieceAttemptRecording,
  readPieceFeedbackReport,
  readPieceOriginalFile,
  readPieceRecognizedMusicXml,
  readPieceStructuredScore,
  savePieceFeedbackReport,
} from "@/features/piece-studio/pieceStudioFiles";
import { PIECE_STUDIO_HREF } from "@/features/piece-studio/pieceStudioRoutes";
import { musicXmlFromBytes } from "@/features/piece-studio/score/musicXmlSource";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";
import { sanitizeMusicXmlDynamics } from "@/features/piece-studio/score/sanitizeMusicXmlDynamics";
import { prepareMusicXmlForEngraving } from "@/features/piece-studio/score/prepareMusicXmlForEngraving";
import { expectedNotesFromScore } from "@/features/piece-studio/score/expectedNotes";
import {
  heardSecondsForRecording,
  recordingTimeToScoreTime,
  scoreTimeToRecordingTime,
  takePlayheadAnchors,
} from "@/features/piece-studio/practice/takePlayheadTime";
import type { MusaiScoreV1 } from "@/features/piece-studio/score/musaiScore";
import {
  resolvePieceWorkspaceView,
  type PieceWorkspaceV1,
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
        <PiecePrepareMark />
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
      <div className="musai-piece-dock" role="status" aria-live="polite" aria-busy="true">
        <MusaiLoadingMark compact />
        <p className="musai-piece-dock__copy">Opening practise…</p>
      </div>
    ),
  },
);

/** Stay up for a full hop across the staff and back, even when the score is already ready. */
const PIECE_LOAD_HOLD_MS = process.env.NODE_ENV === "test" ? 0 : 4400;

const VIEW_OPTIONS: { value: "score" | "practise"; label: string }[] = [
  { value: "score", label: "Score" },
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

/** First paint — back arrow and the loading mark, until the piece is ready. */
function PieceWorkspaceOpening({ progress }: { progress: number }) {
  return (
    <PieceWorkspaceShell>
      <div
        className="musai-piece-workspace__opening"
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Preparing the score"
        data-testid="piece-workspace-opening"
      >
        <MusaiLoadingMark
          progress={progress}
          progressLabel="Opening the piece"
        />
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

/**
 * Persistent piece workspace. Score (with playback) and Practise are the two views.
 */
export function PieceWorkspaceView({ slug }: { slug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("view");
  const [catalogTick, setCatalogTick] = useState(0);
  const [nameSuggestion, setNameSuggestion] = useState<string | null>(null);
  /** undefined = catalog not read yet (SSR + first client paint must match). */
  const [piece, setPiece] = useState<PieceWorkspaceV1 | null | undefined>(
    undefined,
  );
  const [view, setView] = useState<"score" | "practise">(() =>
    requested === "practise" ? "practise" : "score",
  );
  const [loopPick, setLoopPick] = useState<"start" | "end" | null>(null);
  const [loadHold, setLoadHold] = useState(PIECE_LOAD_HOLD_MS > 0);
  const [openProgress, setOpenProgress] = useState(8);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [scoreOpenFor, setScoreOpenFor] = useState<string | null>(null);
  const [structured, setStructured] = useState<MusaiScoreV1 | null | undefined>(
    undefined,
  );
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [rhythmExplainId, setRhythmExplainId] = useState<string | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const coachMemoryKey = piece?.pieceId ? `piece:${piece.pieceId}` : null;
  const [liveCoachIssues, setLiveCoachIssues] = useState<PieceCoachIssueView[]>(
    [],
  );
  const [liveCoachReady, setLiveCoachReady] = useState(false);
  const [livePitchNotes, setLivePitchNotes] = useState<PiecePitchNoteV1[] | null>(
    null,
  );
  const [practiseClock, setPractiseClock] = useState<PiecePlayheadClock | null>(
    null,
  );
  const pauseTakeRef = useRef<(() => void) | null>(null);
  const seekTakeRef = useRef<
    ((scoreSec: number, resume: boolean) => void) | null
  >(null);
  const takePlayingRef = useRef<(() => boolean) | null>(null);
  const { instrument } = useInstrument();
  const playback = usePiecePlayback(structured ?? null, {
    loadInstrument: true,
    stringSoundfont: instrument.listenSoundfont,
  });
  const pieceId = piece?.pieceId ?? null;
  const markScoreOpen = useCallback(() => {
    if (!pieceId) return;
    setScoreOpenFor(pieceId);
  }, [pieceId]);
  const timelineRef = useRef(playback.timeline);
  timelineRef.current = playback.timeline;
  const latestAttempt = piece?.attempts.at(-1) ?? null;
  const hasLivePitch = Boolean(livePitchNotes && livePitchNotes.length > 0);
  const hasLiveCoach = Boolean(
    latestAttempt &&
      liveCoachReady &&
      (liveCoachIssues.length > 0 || hasLivePitch),
  );
  const rawCoachIssues = liveCoachIssues;
  const coachIssues = useMemo(
    () => collapsePieceCoachIssues(rawCoachIssues),
    [rawCoachIssues],
  );
  const previewIssue = coachIssueById(coachIssues, previewId);
  const showPreview = view === "practise" && coachIssues.length > 0;

  const focusedHighlight = useMemo((): PieceScoreHighlight | null => {
    if (!showPreview || !previewIssue) return null;
    // Pitch colours noteheads. Rhythm uses a staff rectangle. Dynamics
    // colours the written letters. None of those use this focused wash.
    if (
      previewIssue.category === "pitch" ||
      previewIssue.category === "rhythm" ||
      previewIssue.category === "dynamics" ||
      previewIssue.category === "tempo"
    ) {
      return null;
    }
    return {
      id: previewIssue.id,
      startWholeNotes: previewIssue.startWholeNotes,
      endWholeNotes: previewIssue.endWholeNotes,
      label: previewIssue.where,
      source: previewIssue.source,
      visualTone: previewIssue.visualTone,
      visualStyle: previewIssue.visualStyle,
      emphasis: "focus",
    };
  }, [showPreview, previewIssue]);

  const [pitchColoursOn, setPitchColoursOn] = useState(true);
  const latestAttemptId = latestAttempt?.attemptId ?? null;
  useEffect(() => {
    setPitchColoursOn(true);
  }, [latestAttemptId]);

  const pitchMarks = useMemo(() => {
    if (view !== "practise" || !hasLivePitch || !structured || !pitchColoursOn) {
      return [];
    }
    return pitchMarksFromTake(
      expectedNotesFromScore(structured),
      livePitchNotes ?? [],
    );
  }, [view, hasLivePitch, structured, livePitchNotes, pitchColoursOn]);

  const dynamicMarks = useMemo(() => {
    if (view !== "practise" || !structured) return [];
    return dynamicLetterMarksFromIssues(
      expectedNotesFromScore(structured),
      coachIssues,
    );
  }, [view, structured, coachIssues]);

  /** Pitch stays on noteheads. Every rhythm miss gets a staff rectangle. */
  const highlights = useMemo((): PieceScoreHighlight[] => {
    if (!showPreview) return [];
    const rhythm = rhythmHighlightsFromIssues(
      coachIssues,
      previewIssue?.category === "rhythm" ? previewIssue.id : null,
    );
    return focusedHighlight ? [focusedHighlight, ...rhythm] : rhythm;
  }, [showPreview, coachIssues, previewIssue, focusedHighlight]);

  const wholeNotesToSeconds = useCallback((wholeNotes: number) => {
    const tl = timelineRef.current;
    if (!tl) return wholeNotes * 4 * (60 / 100);
    return secondsAtQuarter(tl.tempoSpans, wholeNotes * 4);
  }, []);

  const rhythmNoteLabels = useMemo(() => {
    const notes = expectedNotesFromScore(structured ?? null);
    return new Map(notes.map((note) => [note.noteIndex, note.label]));
  }, [structured]);

  const rhythmRun = useMemo(() => {
    if (!showPreview || !rhythmExplainId) return null;
    const run = rhythmRunForIssueId(coachIssues, rhythmExplainId);
    return run && run.length > 0 ? run : null;
  }, [showPreview, coachIssues, rhythmExplainId]);

  const rhythmExplanation = useMemo(() => {
    if (!rhythmRun) return null;
    return rhythmHighlightExplanation(rhythmRun, rhythmNoteLabels);
  }, [rhythmRun, rhythmNoteLabels]);

  const rhythmKey = rhythmRun?.map((issue) => issue.id).join("|") ?? null;
  const seenRhythmRef = useRef(new Set<string>());
  const claimRhythm = useCallback((key: string) => {
    if (seenRhythmRef.current.has(key)) return false;
    seenRhythmRef.current.add(key);
    return true;
  }, []);

  const onHighlightSelect = useCallback((id: string) => {
    tapFeedback("medium");
    setPreviewId(id);
    setRhythmExplainId(rhythmRunForIssueId(coachIssues, id) ? id : null);
    setCoachOpen(true);
    if (coachMemoryKey) writeCoachOpen(coachMemoryKey, true);
  }, [coachMemoryKey, coachIssues]);

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
    if (!coachMemoryKey) return;
    setCoachOpen(readCoachMemory(coachMemoryKey).open);
  }, [coachMemoryKey]);

  useEffect(() => {
    if (!piece) {
      setLiveCoachIssues([]);
      setLivePitchNotes(null);
      setLiveCoachReady(false);
      return;
    }
    const attempt = piece.attempts.at(-1);
    if (!attempt) {
      setLiveCoachIssues([]);
      setLivePitchNotes(null);
      setLiveCoachReady(false);
      return;
    }
    let cancelled = false;
    setLiveCoachReady(false);
    const pieceId = piece.pieceId;
    const attemptId = attempt.attemptId;
    void (async () => {
      if (attempt.hasRecording) {
        const blob = await readPieceAttemptRecording(pieceId, attemptId);
        if (cancelled) return;
        if (blob && isGeneratedPieceSampleRecording(blob)) {
          setLiveCoachIssues([]);
          setLivePitchNotes(null);
          setLiveCoachReady(true);
          return;
        }
      }
      const report = await readPieceFeedbackReport(pieceId, attemptId);
      if (cancelled) return;
      if (!report) {
        setLiveCoachIssues([]);
        setLivePitchNotes(null);
        setLiveCoachReady(true);
        return;
      }
      const ctx = buildPieceCoachContext(report);
      const notes = expectedNotesFromScore(structured ?? null);
      setLiveCoachIssues(coachIssuesFromEvents(ctx.events, notes));
      setLivePitchNotes(report.pitchNotes ?? null);
      setLiveCoachReady(true);
      setPreviewId(
        ctx.events.find((event) => event.category === "pitch")?.eventId ??
          ctx.events[0]?.eventId ??
          null,
      );
    })();
    return () => {
      cancelled = true;
    };
    // piece already refreshes on catalogTick — avoid a duplicate IDB read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece]);

  const heardFillRef = useRef<string | null>(null);
  useEffect(() => {
    if (!piece || !structured || !livePitchNotes || livePitchNotes.length === 0) {
      return;
    }
    if (livePitchNotes.every((note) => "heardSec" in note)) return;
    const attempt = piece.attempts.at(-1);
    if (!attempt?.hasRecording) return;
    if (heardFillRef.current === attempt.attemptId) return;
    heardFillRef.current = attempt.attemptId;
    let cancelled = false;
    const pieceId = piece.pieceId;
    const attemptId = attempt.attemptId;
    const notes = livePitchNotes;
    void (async () => {
      const blob = await readPieceAttemptRecording(pieceId, attemptId);
      if (cancelled || !blob) return;
      const times = await heardSecondsForRecording({
        score: structured,
        blob,
      });
      if (cancelled || !times || times.length !== notes.length) return;
      const filled = notes.map((note, i) => ({
        ...note,
        heardSec: times[i] ?? null,
      }));
      if (cancelled) return;
      setLivePitchNotes(filled);
      const report = await readPieceFeedbackReport(pieceId, attemptId);
      if (cancelled || !report?.pitchNotes) return;
      await savePieceFeedbackReport(pieceId, {
        ...report,
        pitchNotes: report.pitchNotes.map((note, i) => ({
          ...note,
          heardSec: times[i] ?? null,
        })),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [piece, structured, livePitchNotes]);

  useEffect(() => {
    if (!structured) return;
    const notes = expectedNotesFromScore(structured);
    if (notes.length === 0) return;
    setLiveCoachIssues((prev) =>
      prev.map((issue) => {
        const note =
          (typeof issue.noteIndex === "number"
            ? notes.find((n) => n.noteIndex === issue.noteIndex)
            : null) ?? null;
        if (!note) return issue;
        const span = pieceFeedbackSpanWholeNotes({
          category: issue.category,
          onsetQuarters: note.absoluteOnsetQuarters,
          durationQuarters: note.durationQuarters,
        });
        return {
          ...issue,
          measure: issue.measure === "?" ? note.measure : issue.measure,
          beat: issue.beat ?? note.beat,
          ...span,
        };
      }),
    );
  }, [structured]);

  const scoreLoadKey =
    piece === undefined ? "loading" : piece === null ? "missing" : piece.pieceId;
  const audioLoadKey = `${scoreLoadKey}:${piece?.sourceKind ?? ""}:${piece?.hasOriginalFile ? "1" : "0"}`;

  useEffect(() => {
    if (!piece) return;
    const next = resolvePieceWorkspaceView(requested, piece.lastView);
    setView(next);
    touchPieceWorkspace(piece.pieceId, next);
    if (requested === "listen") {
      router.replace(`${PIECE_STUDIO_HREF}/${piece.slug}?view=score`, {
        scroll: false,
      });
    }
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
    // Hold the full-page opening shell until this piece’s score is ready —
    // do not flash Listen/Practise docks with “Preparing playback…”.
    setStructured(undefined);
    setOpenProgress(8);
    const pieceId = workspace.pieceId;
    const title = workspace.title;
    const sourceKind = workspace.sourceKind;
    const hasOriginalFile = workspace.hasOriginalFile;
    const sourceFileName = workspace.sourceFileName;
    let cancelled = false;
    let openTimer = 0;
    void (async () => {
      setOpenProgress(18);
      let score = await readPieceStructuredScore(pieceId);
      if (cancelled) return;
      setOpenProgress(40);
      const recognized = await readPieceRecognizedMusicXml(pieceId);
      if (cancelled) return;
      setOpenProgress(62);
      if (recognized) {
        if (!cancelled) {
          setNameSuggestion(
            recommendedPieceTitle({
              fileName: sourceFileName,
              scoreTitle: title,
              musicXml: recognized,
            }),
          );
        }
        try {
          // Prefer live parse of sanitized MusicXML so OMR cleanups apply
          // to pieces imported before the sanitiser existed.
          const forParse =
            sourceKind === "pdf" || sourceKind === "image"
              ? prepareMusicXmlForEngraving(recognized)
              : recognized;
          score = parseMusicXmlToScore(
            sanitizeMusicXmlDynamics(forParse),
            title,
          );
        } catch {
          /* keep IDB structured if re-parse fails */
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
      if (!cancelled) {
        setOpenProgress(100);
        if (process.env.NODE_ENV !== "test") {
          await new Promise<void>((resolve) => {
            openTimer = window.setTimeout(resolve, 480);
          });
        }
        if (!cancelled) setStructured(score);
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(openTimer);
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
    if (PIECE_LOAD_HOLD_MS === 0) {
      setLoadHold(false);
      return;
    }
    setLoadHold(true);
    const id = window.setTimeout(() => setLoadHold(false), PIECE_LOAD_HOLD_MS);
    return () => window.clearTimeout(id);
  }, [slug]);

  useEffect(() => {
    if (view !== "score") playback.pause();
    if (view !== "practise") {
      setPractiseClock(null);
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

  const takeAnchors = useMemo(
    () =>
      livePitchNotes && structured
        ? takePlayheadAnchors(
            livePitchNotes,
            expectedNotesFromScore(structured),
            (quarters) => wholeNotesToSeconds(quarters / 4),
          )
        : [],
    [livePitchNotes, structured, wholeNotesToSeconds],
  );
  const takeMapRef = useRef({
    anchors: takeAnchors,
    scoreDurationSec: playback.durationSec,
  });
  takeMapRef.current = {
    anchors: takeAnchors,
    scoreDurationSec: playback.durationSec,
  };
  const mapTakeTime = useCallback(
    (audioSec: number, audioDurationSec: number) =>
      recordingTimeToScoreTime(
        audioSec,
        audioDurationSec,
        takeMapRef.current.scoreDurationSec,
        takeMapRef.current.anchors,
      ),
    [],
  );
  const scoreTimeToAudio = useCallback(
    (scoreSec: number, audioDurationSec: number) =>
      scoreTimeToRecordingTime(
        scoreSec,
        audioDurationSec,
        takeMapRef.current.scoreDurationSec,
        takeMapRef.current.anchors,
      ),
    [],
  );
  const onTakeScrubPreview = useCallback(() => {
    pauseTakeRef.current?.();
  }, []);
  const onTakeScrubCommit = useCallback((scoreSec: number, resume: boolean) => {
    seekTakeRef.current?.(scoreSec, resume);
  }, []);
  const onTakeSeek = useCallback((scoreSec: number) => {
    seekTakeRef.current?.(scoreSec, takePlayingRef.current?.() ?? false);
  }, []);

  const playbackNoteTimes = useMemo(
    () =>
      playback.timeline?.notes.map((n) => ({
        startSec: n.startSec,
        endSec: n.endSec,
      })) ?? undefined,
    [playback.timeline],
  );

  const loopSpan = useMemo(() => {
    const range = playback.loop;
    const measures = playback.timeline?.measures;
    if (!range || !measures) return null;
    return loopBoundsSec(measures, range.fromMeasure, range.toMeasure);
  }, [playback.loop, playback.timeline]);
  const onLoopPress = useCallback(() => {
    if (loopPick || playback.loop) {
      setLoopPick(null);
      playback.setLoop(null);
      return;
    }
    setLoopPick("start");
  }, [loopPick, playback]);
  const onLoopMark = useCallback(
    (tSec: number) => {
      if (!loopPick) return;
      const bar = playback.measureNumberAt(tSec);
      if (bar == null) return;
      tapFeedback("light");
      if (loopPick === "start") {
        playback.setLoop({ fromMeasure: bar, toMeasure: bar });
        setLoopPick("end");
        return;
      }
      const from = playback.loop?.fromMeasure ?? bar;
      playback.setLoop({
        fromMeasure: Math.min(from, bar),
        toMeasure: Math.max(from, bar),
      });
      setLoopPick(null);
    },
    [loopPick, playback],
  );

  if (piece === undefined) {
    return <PieceWorkspaceOpening progress={openProgress} />;
  }
  if (!piece) {
    return <PieceWorkspaceMissing slug={slug} />;
  }
  if (structured === undefined) {
    return <PieceWorkspaceOpening progress={openProgress} />;
  }

  const setWorkspaceView = (next: "score" | "practise") => {
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

  const askContext: PieceAskContext = {
    title: piece.title,
    composer: structured?.composer ?? piece.composer,
    keySignature: structured?.keySignature ?? piece.score.keySignature,
    timeSignature: structured?.timeSignature ?? piece.score.timeSignature,
    tempoBpm: structured?.tempoBpm ?? piece.score.tempoBpm,
    measureCount: structured?.measureCount || piece.score.measureCount || 0,
  };
  const listening = view === "score";
  const practising = view === "practise";
  const scoreOpen = scoreOpenFor === piece.pieceId;
  const awaitingPiano =
    piece.sourceKind !== "audio" &&
    playback.scoreReady &&
    playback.instrumentStatus !== "ready" &&
    playback.instrumentStatus !== "error";
  const listenPreparing =
    listening && piece.sourceKind !== "audio" && (!scoreOpen || awaitingPiano);
  const loadingCover = listening && (loadHold || listenPreparing);
  const listenPlayhead = listening && playback.scoreReady;
  const showListenPlayhead = listenPlayhead && !loadingCover;
  const practisePlayhead = practising && practiseClock != null;
  const useScoreClock = listenPlayhead;

  // Stable fiber: same score column across Score / Listen / Practise (dock toggles).
  const scorePaper = (
    <PieceScorePaper
      key={piece.pieceId}
      piece={piece}
      embedded
      followPlayback={listenPlayhead}
      showPlayhead={showListenPlayhead || practisePlayhead}
      subscribePlaybackTime={
        useScoreClock
          ? playback.subscribeTime
          : practisePlayhead
            ? practiseClock?.subscribeTime
            : undefined
      }
      getPlaybackTime={
        useScoreClock
          ? playback.getCurrentSec
          : practisePlayhead
            ? practiseClock?.getCurrentSec
            : undefined
      }
      wholeNotesToSeconds={wholeNotesToSeconds}
      onSeekFromScore={
        listenPlayhead && !loopPick
          ? playback.seekAndPlay
          : practisePlayhead
            ? onTakeSeek
            : undefined
      }
      onLoopMark={listenPlayhead && loopPick ? onLoopMark : undefined}
      loopSpan={listenPlayhead ? loopSpan : null}
      loopPicking={Boolean(listenPlayhead && loopPick)}
      onScrubPreview={
        listenPlayhead
          ? playback.scrubPreview
          : practisePlayhead
            ? onTakeScrubPreview
            : undefined
      }
      onScrubCommit={
        listenPlayhead
          ? playback.commitScrub
          : practisePlayhead
            ? onTakeScrubCommit
            : undefined
      }
      getPlaying={
        listenPlayhead
          ? playback.getPlaying
          : practisePlayhead
            ? () => takePlayingRef.current?.() ?? false
            : undefined
      }
      playbackNotes={playbackNoteTimes}
      highlight={focusedHighlight}
      highlights={highlights}
      pitchMarks={pitchMarks}
      dynamicMarks={dynamicMarks}
      onHighlightSelect={onHighlightSelect}
      onScoreOpen={markScoreOpen}
    />
  );

  const listenDock = listening ? (
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
          clickLevel={playback.clickLevel}
          loop={playback.loop}
          measureCount={playback.measureCount}
          unavailable={listenUnavailable(
            piece,
            playback.scoreReady,
            structured,
          )}
          instrumentStatus={playback.instrumentStatus}
          sampleName={
            instrument.listenSoundfont === "violin" ? "violin" : "piano"
          }
          subscribeTime={playback.subscribeTime}
          getCurrentSec={playback.getCurrentSec}
          onToggle={onTogglePlayback}
          onPause={playback.pause}
          onRestart={onRestartPlayback}
          onBpm={playback.setBpm}
          onSpeedPreset={playback.setSpeedPreset}
          onToggleMetronome={playback.toggleMetronome}
          onClickLevel={playback.setClickLevel}
          onPreviewClick={() => {
            void playback.previewClick();
          }}
          onLoopPress={onLoopPress}
          loopPick={loopPick}
        />
      )}
    </div>
  ) : null;

  // Same outer fiber across Score / Listen / Practise so OSMD is not remounted.
  // Listen dock lives under the stage so short scores pull transport up with them.
  const scoreColumn = (
    <div
      className="musai-piece-workspace__practise-stage"
      data-practise={practising ? "true" : "false"}
      data-pitch-colours={
        practising && hasLivePitch
          ? pitchMarks.length > 0
            ? "on"
            : "off"
          : "none"
      }
    >
      <div
        className="musai-piece-workspace__stage"
        data-coach={coachOpen ? "open" : undefined}
        data-preparing={loadingCover ? "true" : undefined}
      >
        {scorePaper}
        {loadingCover ? <PiecePrepareMark /> : null}
        {coachOpen ? (
          <aside
            id="piece-coach"
            className="musai-studio-coach-drawer musai-teacher-panel"
            aria-label="Teacher"
          >
            {rhythmExplanation && rhythmKey ? (
              <PieceRhythmHighlightPopup
                key={rhythmKey}
                place={rhythmExplanation.place}
                notes={rhythmExplanation.notes}
                memoryKey={rhythmKey}
                claimFresh={claimRhythm}
                onClose={() => setRhythmExplainId(null)}
              />
            ) : null}
            <PieceAskCoach
              pieceId={piece.pieceId}
              context={askContext}
              issue={hasLiveCoach ? previewIssue : null}
              issues={hasLiveCoach ? coachIssues : []}
              suppressCue={Boolean(rhythmExplanation)}
            />
          </aside>
        ) : null}
        <StudioCoachLauncher
          open={coachOpen}
          controlsId="piece-coach"
          label="Teacher"
          onToggle={() =>
            setCoachOpen((open) => {
              const next = !open;
              if (coachMemoryKey) writeCoachOpen(coachMemoryKey, next);
              return next;
            })
          }
        />
      </div>
      {practising ? (
        <PiecePractiseDock
          piece={piece}
          structured={structured}
          onAttemptSaved={() => setCatalogTick((n) => n + 1)}
          onPlayheadClock={setPractiseClock}
          mapTakeTime={mapTakeTime}
          scoreTimeToAudio={scoreTimeToAudio}
          pauseTakeRef={pauseTakeRef}
          seekTakeRef={seekTakeRef}
          takePlayingRef={takePlayingRef}
          showPitchColourToggle={hasLivePitch}
          pitchColoursOn={pitchColoursOn}
          onTogglePitchColours={() => setPitchColoursOn((on) => !on)}
        />
      ) : null}
      {loadingCover ? null : listenDock}
    </div>
  );

  return (
    <StudioViewport>
      <div
        className={
          practising
            ? "musai-piece-workspace musai-piece-workspace--practise"
            : "musai-piece-workspace musai-piece-workspace--listen"
        }
        data-preparing={loadingCover ? "true" : undefined}
      >
        <header className="musai-piece-workspace__nav flex shrink-0 items-center gap-2 px-0 py-2 sm:gap-3 sm:py-2.5">
          <PracticeHubBackLink
            className="!mb-0 shrink-0"
            href={PIECE_STUDIO_HREF}
            label="Piece studio"
            ariaLabel="Back to Piece studio"
          />
          {loadingCover ? null : (
            <PieceScorePdfButton
              title={piece.title}
              className="musai-piece-workspace__pdf"
            />
          )}
        </header>

        {loadingCover ? null : (
          <div className="musai-piece-workspace__identity">
            <div className="musai-piece-workspace__identity-copy">
              <PieceNameControl
                title={piece.title}
                suggestion={nameSuggestion}
                onCommit={(next) => {
                  const saved = renamePieceTitle(piece.pieceId, next);
                  if (saved) setCatalogTick((n) => n + 1);
                }}
              />
            </div>
          </div>
        )}

        {loadingCover ? null : (
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
        )}

        <div className="musai-piece-workspace__body">
          <MusaiSplitPane
            fixedRatio={1}
            minRatio={1}
            maxRatio={1}
            resizable={false}
            leftClassName="musai-piece-workspace__score-pane"
            left={scoreColumn}
            right={null}
          />
        </div>
      </div>
    </StudioViewport>
  );
}
