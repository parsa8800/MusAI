"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatedReveal } from "@/components/motion/AnimatedReveal";
import {
  MusaiSplitPane,
  MUSAI_SCALE_COACH_PANE_CLASS,
  MUSAI_SCALE_SPLIT_STORAGE_KEY,
  MUSAI_SCALE_STAFF_MAX_RATIO,
  MUSAI_SCALE_STAFF_MIN_RATIO,
} from "@/components/MusaiSplitPane";
import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import {
  ScaleAttemptProgressStrip,
  ScaleProgressReadyBar,
} from "@/components/ScaleAttemptProgressStrip";
import { ScaleInlineFeedback } from "@/components/ScaleInlineFeedback";
import { ScalePitchCueKey } from "@/components/ScalePitchCueKey";
import { DraftNotesFrame, DraftTipsFrame } from "@/components/ScaleStudioHomeDraft";
import { ScaleTakeHistoryStrip } from "@/components/ScaleTakeHistoryStrip";
import { ScaleTrebleStaff } from "@/components/ScaleTrebleStaff";
import { alignExpectedMidisToDetectedOctave } from "@/lib/alignScaleOctave";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";
import { buildTakeSummaries } from "@/lib/scaleTakeHistory";
import { type ScaleStudioPhase } from "@/lib/scaleTakeLoop";
import type { ScaleKind } from "@/lib/scales";

function octaveCaption(span: 1 | 2): string {
  return span === 2 ? "2 octaves" : "1 octave";
}

export type ScaleStudioReadyStaff = {
  ascendingMidis: number[];
  descendingMidis: number[];
  tonicPitchClass: number;
  scaleKind: ScaleKind;
};

/**
 * Scale Studio shell: coloured staff + coach stay put.
 * Recording lives in `capture` under the feedback row.
 */
export function ScalePracticeResultsView({
  session = null,
  loopAttempts,
  phase,
  onTryAgain,
  tryAgainLabel = "Try again",
  studioHref = "/practice/scale",
  capture,
  staffChrome,
  readyTitle = "Play a scale",
  readyCaption = "",
  readyStaff,
  showStaffHeading = true,
}: {
  session?: ScalePracticeSessionV1 | null;
  /** Chronological attempts in the current loop (includes `session`). */
  loopAttempts?: ScalePracticeSessionV1[];
  phase?: ScaleStudioPhase;
  onTryAgain?: () => void;
  tryAgainLabel?: string;
  studioHref?: string;
  /** Compact recorder under the staff/coach row. */
  capture?: ReactNode;
  /** Optional pick-notes chrome above the stave (ready only). */
  staffChrome?: ReactNode;
  readyTitle?: string;
  readyCaption?: string;
  readyStaff?: ScaleStudioReadyStaff | "draft";
  /** When false, only take caption / historical nav show above the stave. */
  showStaffHeading?: boolean;
}) {
  const embedded = Boolean(capture);
  const hasSession = Boolean(session);
  const resolvedPhase: ScaleStudioPhase =
    phase ?? (hasSession ? "results" : "ready");
  const [scoreBoot, setScoreBoot] = useState(() => hasSession);
  const [ready, setReady] = useState(!hasSession);
  const [chatStart, setChatStart] = useState(!hasSession);
  const [viewedSessionId, setViewedSessionId] = useState<string | null>(null);
  const seenSessionRef = useRef<string | null>(null);
  const attempts = useMemo(
    () =>
      loopAttempts?.length
        ? loopAttempts
        : session
          ? [session]
          : [],
    [loopAttempts, session],
  );
  const latestSession = session;
  const livePhase =
    resolvedPhase === "recording" || resolvedPhase === "analysing";

  useEffect(() => {
    setViewedSessionId(null);
  }, [latestSession?.sessionId]);

  useEffect(() => {
    if (livePhase) setViewedSessionId(null);
  }, [livePhase]);

  const displaySession = useMemo(() => {
    if (livePhase || !viewedSessionId || !latestSession) return latestSession;
    if (viewedSessionId === latestSession.sessionId) return latestSession;
    return attempts.find((a) => a.sessionId === viewedSessionId) ?? latestSession;
  }, [attempts, latestSession, livePhase, viewedSessionId]);
  const viewingHistorical = Boolean(
    displaySession &&
      latestSession &&
      displaySession.sessionId !== latestSession.sessionId,
  );
  const takeSummaries = useMemo(() => buildTakeSummaries(attempts), [attempts]);
  const { notes, expectedNotesMidi, octaveSpan } = displaySession ?? {};

  useEffect(() => {
    if (!session) {
      setScoreBoot(false);
      setReady(true);
      setChatStart(false);
      return;
    }
    const firstForThisTake = seenSessionRef.current !== session.sessionId;
    const hadPriorTake = seenSessionRef.current != null;
    seenSessionRef.current = session.sessionId;
    if (!firstForThisTake) return;
    if (hadPriorTake || embedded) {
      setScoreBoot(false);
      setReady(true);
      setChatStart(true);
      return;
    }
    setScoreBoot(true);
    setReady(false);
    setChatStart(false);
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = reduce ? 0 : 720;
    const t = window.setTimeout(() => {
      setScoreBoot(false);
      setReady(true);
    }, delay);
    return () => window.clearTimeout(t);
  }, [embedded, session]);

  useEffect(() => {
    if (!session) return;
    if (scoreBoot) {
      setChatStart(false);
      return;
    }
    if (chatStart) return;
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setChatStart(true);
      return;
    }
    const t = window.setTimeout(() => setChatStart(true), 900);
    return () => window.clearTimeout(t);
  }, [chatStart, scoreBoot, session]);

  const split = useMemo(() => {
    if (!displaySession || !expectedNotesMidi || !notes) return null;
    const displayMidis = alignExpectedMidisToDetectedOctave(
      expectedNotesMidi,
      notes,
    );
    const n = displayMidis.length;
    const looksRoundTrip = n >= 3 && displayMidis[0] === displayMidis[n - 1];
    const ascendingSteps = looksRoundTrip ? (n + 1) / 2 : n;
    const ascMidis = displayMidis.slice(0, ascendingSteps);
    const descMidis = looksRoundTrip ? displayMidis.slice(ascendingSteps) : [];
    const ascNotes = notes.slice(0, ascendingSteps);
    const descNotes = looksRoundTrip ? notes.slice(ascendingSteps) : [];
    return { ascMidis, descMidis, ascNotes, descNotes };
  }, [displaySession, expectedNotesMidi, notes]);

  const ascCents = useMemo(
    () => split?.ascNotes.map((r) => (r.missingData ? null : r.centsDifference)),
    [split],
  );
  const descCents = useMemo(
    () =>
      split?.descNotes.map((r) => (r.missingData ? null : r.centsDifference)),
    [split],
  );

  const inLoop = Boolean(onTryAgain);
  const title = session?.scaleLabel ?? readyTitle;
  const viewedTakeNumber = displaySession
    ? Math.max(
        1,
        attempts.findIndex((a) => a.sessionId === displaySession.sessionId) + 1,
      )
    : attempts.length;
  const caption =
    resolvedPhase === "recording"
      ? "Recording"
      : resolvedPhase === "analysing"
        ? "Analysing…"
        : viewingHistorical
          ? `Take ${viewedTakeNumber}`
          : displaySession && octaveSpan
            ? octaveCaption(octaveSpan)
            : readyCaption;

  const body = (
    <>
      {!embedded ? (
        inLoop ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] font-medium text-[var(--musai-muted)]">
              Same scale · keep going
            </p>
            <Link
              href={studioHref}
              className="text-[12px] font-medium text-[var(--musai-muted)] underline decoration-[var(--musai-border)] underline-offset-2 hover:text-[var(--musai-ink)]"
            >
              Scale studio
            </Link>
          </div>
        ) : (
          <PracticeHubBackLink
            href={studioHref}
            label="Scale studio"
            ariaLabel="Back to Scale studio"
          />
        )
      ) : null}

      <header
        data-anime-enter
        className="musai-glass-panel shrink-0 px-3 py-1.5 sm:px-4 sm:py-2"
      >
        {session ? (
          <>
            <ScaleAttemptProgressStrip
              session={displaySession ?? session}
              loopAttempts={attempts}
              showNewBest
              size="lg"
              padded={false}
              showWaveform={!embedded}
              endSlot={
                <ScaleTakeHistoryStrip
                  takes={takeSummaries}
                  selectedId={(displaySession ?? session).sessionId}
                  onSelect={setViewedSessionId}
                />
              }
            />
          </>
        ) : (
          <ScaleProgressReadyBar size="lg" />
        )}
      </header>

      <div
        data-anime-enter
        className={
          embedded
            ? "min-h-0 flex-1 overflow-hidden"
            : "h-auto min-h-0 overflow-hidden md:h-[min(70vh,42rem)] md:min-h-[26rem]"
        }
      >
        <MusaiSplitPane
          storageKey={MUSAI_SCALE_SPLIT_STORAGE_KEY}
          className={embedded ? "musai-studio-stage-split" : undefined}
          divider="soft"
          resizable
          minRatio={MUSAI_SCALE_STAFF_MIN_RATIO}
          maxRatio={MUSAI_SCALE_STAFF_MAX_RATIO}
          leftClassName="md:min-w-[min(100%,28rem)]"
          rightClassName={MUSAI_SCALE_COACH_PANE_CLASS}
          left={
            <div className="musai-studio-col flex h-full min-h-0 flex-col">
            <section
              className={`musai-glass-panel flex min-h-0 flex-1 flex-col overflow-hidden ${
                embedded
                  ? "musai-studio-notes-panel px-2.5 py-1.5 sm:px-3 sm:py-2"
                  : "px-4 py-4 sm:px-5 sm:py-5"
              }`}
              data-historical={viewingHistorical ? "true" : "false"}
              aria-label={
                viewingHistorical
                  ? "Earlier take note feedback"
                  : session
                    ? "Colour-coded note feedback"
                    : "Scale notes"
              }
            >
              {staffChrome && !session ? (
                <div className="musai-scale-staff-chrome-wrap shrink-0">
                  {staffChrome}
                </div>
              ) : null}

              {!showStaffHeading && !caption && !viewingHistorical && title ? (
                <h1 className="sr-only">{title}</h1>
              ) : null}

              {showStaffHeading || caption || viewingHistorical ? (
                <div
                  className={`musai-scale-staff-heading${
                    embedded ? " musai-scale-staff-heading--compact" : ""
                  }${!caption && !viewingHistorical ? " musai-scale-staff-heading--title-only" : ""}`}
                >
                  {showStaffHeading ? (
                    <h1 className="musai-scale-staff-heading__title font-display">
                      {title}
                    </h1>
                  ) : null}
                  {caption ? (
                    <p
                      className="musai-scale-staff-heading__take"
                      aria-live="polite"
                    >
                      {caption}
                    </p>
                  ) : null}
                  {viewingHistorical ? (
                    <button
                      type="button"
                      className="musai-pressable musai-scale-staff-heading__back"
                      aria-label="Back to latest take"
                      onClick={() => setViewedSessionId(null)}
                    >
                      Latest
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div
                className="musai-notation-frame musai-rv-details musai-scroll min-h-0 min-w-0 flex-1 overflow-hidden"
                data-testid="scale-notation-frame"
              >
                {displaySession && split ? (
                  <ScaleTrebleStaff
                    ascendingMidis={split.ascMidis}
                    descendingMidis={split.descMidis}
                    ascendingCents={ascCents}
                    descendingCents={descCents}
                    tonicPitchClass={displaySession.tonicPitchClass}
                    scaleKind={displaySession.scaleKind}
                    keepPhrasesWhole
                    density={embedded ? "pad" : "default"}
                    className="min-h-0 flex-1"
                  />
                ) : resolvedPhase === "analysing" ? (
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
                    <div
                      className="h-10 w-10 rounded-full border-2 border-transparent border-t-[var(--musai-accent)] motion-safe:animate-spin motion-reduce:animate-none"
                      aria-hidden
                    />
                    <p className="text-[14px] font-medium text-[var(--musai-ink)]">
                      Analysing…
                    </p>
                  </div>
                ) : readyStaff && readyStaff !== "draft" ? (
                  <div
                    className="musai-notes-draft-frame musai-notes-preview flex min-h-0 w-full flex-1 flex-col justify-center overflow-hidden px-2.5 py-2.5 sm:px-3.5 sm:py-3"
                    role="img"
                    aria-label="Selected scale preview. Your notes and feedback will appear here"
                  >
                    <ScaleTrebleStaff
                      ascendingMidis={readyStaff.ascendingMidis}
                      descendingMidis={readyStaff.descendingMidis}
                      tonicPitchClass={readyStaff.tonicPitchClass}
                      scaleKind={readyStaff.scaleKind}
                      keepPhrasesWhole
                      density={embedded ? "pad" : "default"}
                      appearance="preview"
                      className="min-h-0 flex-1"
                    />
                  </div>
                ) : (
                  <DraftNotesFrame className="min-h-0 flex-1" />
                )}
              </div>

              {displaySession ? (
                <div className="musai-notation-legend shrink-0">
                  <ScalePitchCueKey compact />
                </div>
              ) : null}
            </section>
            {embedded && capture ? (
              <div className="musai-studio-stage__capture shrink-0">
                {capture}
              </div>
            ) : null}
            </div>
          }
          right={
            <aside
              className={`flex h-full min-h-0 flex-col overflow-hidden ${
                embedded ? "px-1.5 py-1 sm:px-2 sm:py-1.5" : "px-3 py-4 sm:px-4 sm:py-5"
              }`}
              aria-label="Coach feedback"
            >
              {session && chatStart ? (
                <ScaleInlineFeedback
                  session={session}
                  loopAttempts={attempts}
                />
              ) : session ? (
                <div className="musai-glass-panel flex items-center gap-2.5 px-3 py-2.5">
                  <div
                    className="h-5 w-5 shrink-0 rounded-full border-2 border-[var(--musai-border)] border-t-[var(--musai-accent)] motion-safe:animate-spin motion-reduce:animate-none"
                    aria-hidden
                  />
                  <p className="text-[14px] font-medium text-[var(--musai-ink)]">
                    Coach · Parsa
                  </p>
                </div>
              ) : resolvedPhase === "analysing" ? (
                <div className="musai-glass-panel flex items-center gap-2.5 px-3 py-2.5">
                  <div
                    className="h-5 w-5 shrink-0 rounded-full border-2 border-[var(--musai-border)] border-t-[var(--musai-accent)] motion-safe:animate-spin motion-reduce:animate-none"
                    aria-hidden
                  />
                  <p className="text-[14px] font-medium text-[var(--musai-ink)]">
                    Analysing…
                  </p>
                </div>
              ) : (
                <DraftTipsFrame className="musai-glass-panel h-full min-h-0" />
              )}
            </aside>
          }
        />
      </div>

      {embedded && capture ? null : capture ? (
        <div className="musai-studio-stage__capture flex w-full shrink-0 flex-col">
          {capture}
        </div>
      ) : (
        <div
          data-anime-enter
          className="flex flex-wrap items-center justify-center gap-3"
        >
          {onTryAgain ? (
            <button
              type="button"
              onClick={onTryAgain}
              className="musai-btn-primary"
            >
              {tryAgainLabel}
            </button>
          ) : (
            <Link href={studioHref} className="musai-btn-primary">
              {tryAgainLabel}
            </Link>
          )}
          <Link href="/" className="musai-btn-secondary">
            Practice hub
          </Link>
        </div>
      )}
    </>
  );

  const frameClass = embedded
    ? `flex min-h-0 w-full flex-1 flex-col gap-1 overflow-hidden ${ready ? "musai-results-ready" : ""}`
    : `w-full max-w-[min(1180px,100%)] space-y-6 sm:space-y-7 ${
        ready ? "musai-results-ready" : ""
      }`;

  return (
    <AnimatedReveal className={frameClass} delay={embedded ? 0 : 30}>
      <div
        className={embedded ? "flex min-h-0 flex-1 flex-col gap-1 overflow-hidden" : "contents"}
        data-studio-phase={resolvedPhase}
      >
        {body}
      </div>
    </AnimatedReveal>
  );
}
