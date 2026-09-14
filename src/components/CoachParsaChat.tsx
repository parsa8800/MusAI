"use client";

/* Coach chat animation sync — same patterns as the former Scale CoachChatPanel. */
/* eslint-disable react-hooks/set-state-in-effect */

import {
  FormEvent,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
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

export type CoachReplySource = "llm" | "template";

type AssistantMsg = {
  id: string;
  role: "assistant";
  text: string;
  stream: boolean;
  source: CoachReplySource;
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
      className={
        pad === "embed"
          ? "musai-coach-prompts musai-coach-prompts--embed"
          : "musai-coach-prompts musai-coach-prompts--page"
      }
      role="group"
      aria-label="Suggested questions"
    >
      {questions.slice(0, 3).map((q) => (
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
  );
}

/** Tiny optional hint when coaching is preview (not live). */
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
        aria-label="Example coaching"
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
          Example
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
}: {
  text: string;
  stream: boolean;
  showThinking: boolean;
  onStreamDone?: () => void;
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
    <div className="min-w-0">
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

export type CoachChatHistoryItem = { role: "user" | "assistant"; text: string };

export type CoachParsaChatProps = {
  start: boolean;
  /** Opening assistant message (often 1–2 short bullets). */
  openerText: string;
  source?: CoachReplySource;
  /** Suggested follow-ups under the opener. */
  suggestions?: string[];
  /**
   * Domain reply adapter. Scale points at /api/scale-coach-chat;
   * Piece uses a local template grounded in the focused issue.
   */
  getReply: (
    userText: string,
    history: CoachChatHistoryItem[],
  ) => Promise<{ reply: string; source?: CoachReplySource }>;
  /** Sanitize / trim user draft before send. Defaults to trim. */
  sanitizeUserText?: (raw: string) => string;
  embed?: boolean;
  title?: string;
  /** Content above the chat thread (e.g. Piece focus card). */
  topSlot?: ReactNode;
  /** When true, show the tiny preview status dot beside the title. */
  showPreviewDot?: boolean;
};

/**
 * Shared Coach · Parsa chat chrome — domain-agnostic.
 * Scale and Piece adapters supply opener text + getReply.
 */
export function CoachParsaChat({
  start,
  openerText,
  source: initialSource = "template",
  suggestions = [],
  getReply,
  sanitizeUserText = (raw) => raw.trim(),
  embed = false,
  title = "Coach · Parsa",
  topSlot = null,
  showPreviewDot,
}: CoachParsaChatProps) {
  const reduce = usePrefersReducedMotion();
  const formId = useId();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [messages, setMessages] = useState<ThreadMsg[]>([]);
  const [bootDone, setBootDone] = useState(false);
  const [coachSource, setCoachSource] = useState<CoachReplySource>(initialSource);
  const [inflate, setInflate] = useState(false);
  const bubbleSizeRef = useRef<CoachBubbleSize>("seed");
  const getReplyRef = useRef(getReply);
  getReplyRef.current = getReply;

  const speech = useCoachSpeechInput({
    disabled: !bootDone || busy,
    onTranscript: setDraft,
  });

  useEffect(() => {
    setCoachSource(initialSource);
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

    const trimmed = openerText.trim();
    if (!trimmed) {
      // Focus card carries the main feedback — keep chat quiet until they ask.
      setMessages([]);
      setBootDone(true);
      return;
    }
    setMessages([
      {
        id: "coach-initial",
        role: "assistant",
        text: trimmed,
        stream: true,
        source: initialSource,
      },
    ]);
    setBootDone(false);
    // speech.stop is stable enough; avoid re-boot on speech identity churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, openerText, initialSource]);

  useEffect(() => {
    const el = bottomRef.current;
    if (!el || typeof el.scrollIntoView !== "function") return;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  }, [messages, busy, awaitingReply, reduce]);

  async function sendUserMessage(userText: string) {
    const userMsg: UserMsg = {
      id: `u-${Date.now()}`,
      role: "user",
      text: userText,
    };
    const historyForApi: CoachChatHistoryItem[] = [...messages, userMsg].map(
      (m) => ({
        role: m.role,
        text: m.text,
      }),
    );

    setBusy(true);
    setAwaitingReply(true);
    setMessages((prev) => [...prev, userMsg]);

    let answer = "• Keep listening — try that spot again slowly.";
    let replySource: CoachReplySource = "template";
    try {
      const data = await getReplyRef.current(userText, historyForApi);
      if (typeof data.reply === "string" && data.reply.trim()) {
        answer = data.reply.trim();
      }
      if (data.source === "llm" || data.source === "template") {
        replySource = data.source;
        setCoachSource(data.source);
      }
    } catch {
      /* keep fallback */
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const userText = sanitizeUserText(draft);
    if (!userText || busy || !bootDone) return;
    speech.stop();
    setDraft("");
    await sendUserMessage(userText);
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

  const canSend = bootDone && !busy && Boolean(sanitizeUserText(draft));
  const previewDot =
    showPreviewDot ?? coachSource !== "llm";
  const showSuggestions =
    bootDone && !busy && messages.length <= 1 && suggestions.length > 0;

  return (
    <div
      className={
        embed
          ? `musai-coach-bubble musai-coach-bubble--${bubbleSize}${
              inflate ? " musai-coach-bubble--inflate" : ""
            } flex h-full min-h-0 flex-col text-left`
          : "musai-rv-actions mx-auto mt-10 w-full max-w-[48rem] text-left"
      }
      data-testid="coach-chat"
      data-coach-size={embed ? bubbleSize : undefined}
      role="log"
      aria-live="polite"
      aria-relevant="additions"
    >
      {embed ? (
        <header className="musai-coach-header">
          <span className="musai-coach-header__avatar" aria-hidden>
            P
          </span>
          <p className="musai-coach-header__title">
            <span className="inline-flex items-center">
              {title}
              {previewDot ? <PreviewCoachDot /> : null}
            </span>
          </p>
        </header>
      ) : null}

      {topSlot ? (
        <div className={embed ? "musai-coach-top" : "mb-4"}>{topSlot}</div>
      ) : null}

      <div
        className={
          embed
            ? `musai-scroll musai-coach-thread${
                messages.length === 0 ? " musai-coach-thread--quiet" : ""
              }`
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
          embed ? "musai-coach-composer musai-coach-composer--embed" : "musai-coach-composer"
        }
      >
        <div className="musai-coach-composer__field">
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
            className="musai-coach-composer__input"
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
