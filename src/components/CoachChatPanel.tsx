"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import {
  localCoachChatReply,
  buildScaleCoachChatContext,
  coachSuggestedQuestions,
} from "@/lib/scaleCoachChat";
import { ensureBulletFeedback, sanitizeCoachFeedback, takeCoachBullets } from "@/lib/scalePracticeCopy";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";
import { useCoachSpeechInput } from "@/hooks/useCoachSpeechInput";
import { tapFeedback } from "@/lib/motion";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function useTypedText(full: string, active: boolean, msPerChar = 16): string {
  const reduce = usePrefersReducedMotion();
  const [shown, setShown] = useState("");

  useEffect(() => {
    if (!active || !full) {
      setShown("");
      return;
    }
    if (reduce) {
      setShown(full);
      return;
    }

    setShown("");
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setShown(full.slice(0, i));
      if (i >= full.length) window.clearInterval(id);
    }, msPerChar);

    return () => window.clearInterval(id);
  }, [full, active, msPerChar, reduce]);

  return shown;
}

function StreamingCaret() {
  return (
    <span
      className="musai-chat-caret ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.12em] bg-[var(--musai-accent)] align-baseline"
      aria-hidden
    />
  );
}

function ThinkingIndicator() {
  return (
    <div className="musai-coach-typing" aria-label="Thinking">
      <i aria-hidden />
      <i aria-hidden />
      <i aria-hidden />
    </div>
  );
}

type ReplySource = "llm" | "template";

type AssistantMsg = {
  id: string;
  role: "assistant";
  text: string;
  stream: boolean;
  source: ReplySource;
};

type UserMsg = {
  id: string;
  role: "user";
  text: string;
};

type ThreadMsg = AssistantMsg | UserMsg;

export type CoachBubbleSize = "seed" | "open" | "thread";

/** Tiny opener, then the bubble inflates as they keep talking. */
export function coachBubbleSize(
  userTurns: number,
  awaitingReply = false,
): CoachBubbleSize {
  if (userTurns <= 0) return awaitingReply ? "open" : "seed";
  if (userTurns === 1) return "open";
  return "thread";
}

function UserBubble({ text, compact }: { text: string; compact?: boolean }) {
  return (
    <div className="flex justify-end">
      <div
        className={`max-w-[90%] rounded-[1.15rem] bg-[var(--musai-surface-2)] text-[var(--musai-ink)] ${
          compact
            ? "px-3 py-2 text-[14.5px] leading-6"
            : "px-3.5 py-2.5 text-[15px] leading-6 sm:max-w-[70%]"
        }`}
      >
        {text}
      </div>
    </div>
  );
}

function PromptChips({
  questions,
  disabled,
  onPick,
  pad,
}: {
  questions: string[];
  disabled: boolean;
  onPick: (q: string) => void;
  pad: "embed" | "page";
}) {
  return (
    <div
      className={pad === "embed" ? "shrink-0 px-4 pb-3" : "pt-1"}
      role="group"
      aria-label="Suggested questions"
    >
      <div className="flex flex-col gap-1.5">
        {questions.map((q) => (
          <button
            key={q}
            type="button"
            disabled={disabled}
            onClick={() => onPick(q)}
            className="musai-coach-prompt"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Tiny optional hint when coaching is preview (not live). No visible Demo/Preview label. */
function PreviewCoachDot() {
  const tipId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={rootRef} className="relative ml-1.5 inline-flex translate-y-px items-center">
      <button
        type="button"
        aria-label="Preview coaching"
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--musai-border)]"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
      >
        <span
          className="block h-[5px] w-[5px] rounded-full bg-[var(--musai-muted)] opacity-[0.35]"
          aria-hidden
        />
      </button>
      {open ? (
        <span
          id={tipId}
          role="tooltip"
          className="pointer-events-none absolute left-1/2 top-[calc(100%+6px)] z-20 -translate-x-1/2 whitespace-nowrap rounded-full border border-[var(--musai-border)] bg-[var(--musai-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--musai-muted)] shadow-[var(--musai-shadow)]"
        >
          Preview coaching
        </span>
      ) : null}
    </span>
  );
}

function AssistantTurn({
  text,
  stream,
  showThinking,
  onStreamDone,
  compact = false,
}: {
  text: string;
  stream: boolean;
  showThinking: boolean;
  onStreamDone?: () => void;
  compact?: boolean;
}) {
  const reduce = usePrefersReducedMotion();
  const [phase, setPhase] = useState<"thinking" | "typing" | "done">(
    showThinking && !reduce ? "thinking" : stream && !reduce ? "typing" : "done",
  );
  const shown = useTypedText(text, phase === "typing" || phase === "done");
  const doneRef = useRef(false);

  useEffect(() => {
    if (phase !== "thinking") return;
    const t = window.setTimeout(() => setPhase("typing"), 900);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "typing") return;
    if (reduce || shown.length >= text.length) {
      setPhase("done");
    }
  }, [phase, shown, text, reduce]);

  useEffect(() => {
    if (phase !== "done" || doneRef.current) return;
    doneRef.current = true;
    onStreamDone?.();
  }, [phase, onStreamDone]);

  const typing = phase === "typing" && shown.length < text.length && !reduce;
  const display = reduce || phase === "done" ? text : shown;
  const lines = display.split("\n").filter(Boolean);

  return (
    <div className={compact ? "" : "min-w-0"}>
      {phase === "thinking" ? (
        <ThinkingIndicator />
      ) : (
        <div className="musai-coach-msg text-[15px] leading-[1.55] text-[var(--musai-ink)]">
          {lines.map((line, i) => {
            const body = line.replace(/^•\s*/, "");
            const isLast = i === lines.length - 1;
            return (
              <p key={`${i}-${body.slice(0, 12)}`} className={i > 0 ? "mt-2" : ""}>
                {body}
                {typing && isLast ? <StreamingCaret /> : null}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}

type Props = {
  start: boolean;
  trendLine: string;
  tip: string;
  source: "template" | "llm";
  session: ScalePracticeSessionV1;
  /** Kept for API compatibility; never shown in the UI. */
  initialError?: string | null;
  /** Embed beside the staff on results (fills column, no top rule). */
  embed?: boolean;
  /** Sidebar heading when embedded. */
  title?: string;
  /** Loop takes so the coach knows the progress bar streak. */
  loopAttempts?: ScalePracticeSessionV1[];
};

/**
 * Coach chat. Preview mode only shows a tiny muted status dot — no Demo labels.
 */
export function CoachChatPanel({
  start,
  trendLine,
  tip,
  source: initialSource,
  session,
  initialError = null,
  embed = false,
  title = "Coach · Parsa",
  loopAttempts,
}: Props) {
  const reduce = usePrefersReducedMotion();
  const formId = useId();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [messages, setMessages] = useState<ThreadMsg[]>([]);
  const [bootDone, setBootDone] = useState(false);
  const [coachSource, setCoachSource] = useState<ReplySource>(
    initialSource ?? "template",
  );
  const [inflate, setInflate] = useState(false);
  const bubbleSizeRef = useRef<CoachBubbleSize>("seed");

  const speech = useCoachSpeechInput({
    disabled: !bootDone || busy,
    onTranscript: setDraft,
  });

  useEffect(() => {
    setCoachSource(initialSource ?? "template");
  }, [initialSource]);

  useEffect(() => {
    if (!start) {
      speech.stop();
      setMessages([]);
      setBootDone(false);
      setBusy(false);
      setAwaitingReply(false);
      setDraft("");
      return;
    }

    const initial = takeCoachBullets(
      [trendLine, tip].filter(Boolean).join("\n"),
      2,
    );
    setMessages([
      {
        id: "coach-initial",
        role: "assistant",
        text: initial,
        stream: true,
        source: initialSource ?? "template",
      },
    ]);
    setBootDone(false);
  }, [start, trendLine, tip, initialSource, initialError]);

  useEffect(() => {
    const el = bottomRef.current;
    if (!el || typeof el.scrollIntoView !== "function") return;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  }, [messages, busy, awaitingReply, reduce]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const userText = sanitizeCoachFeedback(draft.trim());
    if (!userText || busy || !bootDone) return;
    speech.stop();
    setDraft("");
    await sendUserMessage(userText);
  }

  async function sendUserMessage(userText: string) {
    const userMsg: UserMsg = {
      id: `u-${Date.now()}`,
      role: "user",
      text: userText,
    };
    const historyForApi = [...messages, userMsg].map((m) => ({
      role: m.role,
      text: m.text,
    }));

    setBusy(true);
    setAwaitingReply(true);
    setMessages((prev) => [...prev, userMsg]);

    const ctx = buildScaleCoachChatContext(
      session,
      tip,
      trendLine,
      loopAttempts,
    );
    let answer = localCoachChatReply(userText, ctx);
    let replySource: ReplySource = "template";

    try {
      const res = await fetch("/api/scale-coach-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session,
          tip,
          trendLine,
          loopAttempts,
          messages: historyForApi,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          reply?: string;
          source?: ReplySource;
        };
        if (typeof data.reply === "string" && data.reply.trim()) {
          answer = ensureBulletFeedback(data.reply);
        }
        if (data.source === "llm" || data.source === "template") {
          replySource = data.source;
          setCoachSource(data.source);
        }
      }
    } catch {
      /* keep local reply */
    }

    setAwaitingReply(false);
    setMessages((prev) => [
      ...prev,
      {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: answer,
        stream: true,
        source: replySource,
      },
    ]);
  }

  const userTurns = messages.filter((m) => m.role === "user").length;
  const bubbleSize = coachBubbleSize(userTurns, awaitingReply);

  useEffect(() => {
    const rank: Record<CoachBubbleSize, number> = {
      seed: 0,
      open: 1,
      thread: 2,
    };
    const grew = rank[bubbleSize] > rank[bubbleSizeRef.current];
    bubbleSizeRef.current = bubbleSize;
    if (!grew || reduce) {
      setInflate(false);
      return;
    }
    setInflate(true);
    const t = window.setTimeout(() => setInflate(false), 720);
    return () => window.clearTimeout(t);
  }, [bubbleSize, reduce]);

  if (!start) return null;

  const canSend = bootDone && !busy && Boolean(draft.trim());
  const showPreviewDot = coachSource !== "llm";
  const suggestions = coachSuggestedQuestions(
    buildScaleCoachChatContext(session, tip, trendLine, loopAttempts),
  );
  const showSuggestions =
    bootDone && !busy && messages.length <= 1 && suggestions.length > 0;

  return (
    <div
      className={
        embed
          ? `musai-coach-bubble musai-coach-bubble--${bubbleSize}${
              inflate ? " musai-coach-bubble--inflate" : ""
            } h-full min-h-0 text-left`
          : "musai-rv-actions mx-auto mt-10 w-full max-w-[48rem] text-left"
      }
      data-testid="coach-chat"
      data-coach-size={embed ? bubbleSize : undefined}
      role="log"
      aria-live="polite"
      aria-relevant="additions"
    >
      {embed ? (
        <header className="flex shrink-0 items-center gap-2.5 px-4 pb-1 pt-3.5">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--musai-surface-2)] text-[11px] font-medium text-[var(--musai-muted)]"
            aria-hidden
          >
            P
          </span>
          <p className="text-[14px] font-medium tracking-[-0.01em] text-[var(--musai-ink)]">
            <span className="inline-flex items-center">
              {title}
              {showPreviewDot ? <PreviewCoachDot /> : null}
            </span>
          </p>
        </header>
      ) : null}
      <div
        className={
          embed
            ? "musai-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-4"
            : "space-y-6 border-t border-[var(--musai-border)] pt-8"
        }
      >
        {messages.map((msg, idx) => {
          if (msg.role === "user") {
            return <UserBubble key={msg.id} text={msg.text} compact={embed} />;
          }
          const isLatestAssistant =
            !awaitingReply &&
            messages.slice(idx + 1).every((m) => m.role !== "assistant");
          return (
            <AssistantTurn
              key={msg.id}
              text={msg.text}
              stream={msg.stream}
              showThinking={idx === 0}
              compact={embed}
              onStreamDone={
                isLatestAssistant
                  ? () => {
                      setBootDone(true);
                      setBusy(false);
                    }
                  : undefined
              }
            />
          );
        })}

        {awaitingReply ? <ThinkingIndicator /> : null}

        {!embed && showSuggestions ? (
          <PromptChips
            questions={suggestions}
            disabled={!bootDone || busy}
            onPick={(q) => void sendUserMessage(q)}
            pad="page"
          />
        ) : null}

        <div ref={bottomRef} />
      </div>

      {embed && showSuggestions ? (
        <PromptChips
          questions={suggestions}
          disabled={!bootDone || busy}
          onPick={(q) => void sendUserMessage(q)}
          pad="embed"
        />
      ) : null}

      <form
        id={formId}
        onSubmit={onSubmit}
        className={
          embed
            ? "shrink-0 px-3 pb-3 pt-1"
            : "sticky bottom-0 pt-3"
        }
      >
        <div
          className={`flex items-end rounded-[var(--musai-radius-lg)] border border-[var(--musai-glass-stroke)] bg-[var(--musai-glass-fill)] ${
            embed
              ? "gap-1 px-1.5 py-1"
              : "gap-1.5 px-2 py-1.5 sm:px-2.5"
          }`}
        >
          {speech.supported ? (
            <button
              type="button"
              disabled={!bootDone || busy}
              aria-pressed={speech.listening}
              aria-label={
                speech.listening ? "Stop voice input" : "Speak your question"
              }
              title={speech.listening ? "Stop" : "Speak"}
              onClick={() => {
                tapFeedback(speech.listening ? "medium" : "light");
                speech.toggle(draft);
              }}
            className={`musai-pressable musai-coach-mic inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition disabled:opacity-55 ${
                speech.listening
                  ? "musai-coach-mic--live bg-[var(--musai-accent-soft)] text-[var(--musai-accent)]"
                  : "text-[var(--musai-muted)] hover:bg-[var(--musai-surface-2)] hover:text-[var(--musai-ink)]"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[1.05rem] w-[1.05rem]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.85"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 3.75a2.75 2.75 0 0 0-2.75 2.75v5a2.75 2.75 0 1 0 5.5 0v-5A2.75 2.75 0 0 0 12 3.75Z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7.5 11.25a4.5 4.5 0 0 0 9 0M12 15.75v3.5m-2.75 0h5.5"
                />
              </svg>
            </button>
          ) : null}
          <label className="sr-only" htmlFor={`${formId}-input`}>
            Message
          </label>
          <textarea
            id={`${formId}-input`}
            rows={1}
            value={draft}
            disabled={!bootDone || busy}
            placeholder={speech.listening ? "Listening…" : "Ask your coach..."}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            className={`flex-1 resize-none bg-transparent text-[var(--musai-ink)] outline-none placeholder:text-[var(--musai-muted)] disabled:opacity-50 ${
              embed
                ? "max-h-28 min-h-[34px] py-1.5 text-[14.5px] leading-6"
                : "max-h-32 min-h-[36px] py-2 text-[15px] leading-6"
            }`}
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send"
            className={`musai-pressable inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
              canSend
                ? "bg-[var(--musai-ink)] text-[var(--musai-surface)]"
                : "bg-transparent text-[var(--musai-muted)] opacity-55"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              aria-hidden
            >
              <path
                d="M12 19V5M12 5l-5 5M12 5l5 5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
