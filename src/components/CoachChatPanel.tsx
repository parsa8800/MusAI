"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import {
  localCoachChatReply,
  buildScaleCoachChatContext,
  coachSuggestedQuestions,
} from "@/lib/scaleCoachChat";
import { ensureBulletFeedback, sanitizeCoachFeedback } from "@/lib/scalePracticeCopy";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";

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
    <div className="inline-flex items-center gap-1.5 py-0.5" aria-label="Thinking">
      <span className="musai-chat-thinking-shimmer text-[15px] font-medium tracking-tight">
        Thinking
      </span>
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

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end px-1">
      <div className="max-w-[85%] rounded-[22px] border border-[var(--musai-border)] bg-[var(--musai-accent-soft)] px-[18px] py-[10px] text-[15px] leading-6 text-[var(--musai-ink)] sm:max-w-[70%]">
        {text}
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
    <div className="min-w-0 px-1">
      {phase === "thinking" ? (
        <ThinkingIndicator />
      ) : (
        <ul className="list-none space-y-2.5 text-[16px] leading-7 text-[var(--musai-ink)]">
          {lines.map((line, i) => {
            const body = line.replace(/^•\s*/, "");
            const isLast = i === lines.length - 1;
            return (
              <li key={`${i}-${body.slice(0, 12)}`} className="flex gap-2.5">
                <span
                  className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--musai-accent)]"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 whitespace-pre-wrap">
                  {body}
                  {typing && isLast ? <StreamingCaret /> : null}
                </span>
              </li>
            );
          })}
        </ul>
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

  useEffect(() => {
    setCoachSource(initialSource ?? "template");
  }, [initialSource]);

  useEffect(() => {
    if (!start) {
      setMessages([]);
      setBootDone(false);
      setBusy(false);
      setAwaitingReply(false);
      setDraft("");
      return;
    }

    const initial = ensureBulletFeedback(
      [trendLine, tip].filter(Boolean).join("\n"),
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

    const ctx = buildScaleCoachChatContext(session, tip, trendLine);
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

  if (!start) return null;

  const canSend = bootDone && !busy && Boolean(draft.trim());
  const showPreviewDot = coachSource !== "llm";
  const suggestions = coachSuggestedQuestions(
    buildScaleCoachChatContext(session, tip, trendLine),
  );
  const showSuggestions = bootDone && !busy && messages.length <= 1;

  return (
    <div
      className={
        embed
          ? "flex h-full min-h-0 w-full flex-col text-left"
          : "musai-rv-actions mx-auto mt-10 w-full max-w-[48rem] text-left"
      }
      data-testid="coach-chat"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
    >
      <div
        className={
          embed
            ? "flex min-h-0 flex-1 flex-col space-y-5 overflow-y-auto px-1"
            : "space-y-7 border-t border-[var(--musai-border)] pt-8"
        }
      >
        {embed ? (
          <p className="font-display text-lg font-semibold tracking-tight text-[var(--musai-ink)]">
            <span className="inline-flex items-center">
              {title}
              {showPreviewDot ? <PreviewCoachDot /> : null}
            </span>
          </p>
        ) : null}
        {messages.map((msg, idx) => {
          if (msg.role === "user") {
            return <UserBubble key={msg.id} text={msg.text} />;
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

        {awaitingReply ? (
          <div className="px-1">
            <ThinkingIndicator />
          </div>
        ) : null}

        {showSuggestions ? (
          <div
            className="flex flex-wrap gap-1.5 px-1 pt-1"
            role="group"
            aria-label="Suggested questions"
          >
            {suggestions.map((q) => (
              <button
                key={q}
                type="button"
                disabled={!bootDone || busy}
                onClick={() => void sendUserMessage(q)}
                className="rounded-full border border-[var(--musai-border)] bg-[var(--musai-surface-2)] px-2.5 py-1 text-left text-[11px] font-medium leading-snug text-[var(--musai-ink)] transition hover:border-[var(--musai-accent)] hover:bg-[var(--musai-accent-soft)] disabled:opacity-40"
              >
                {q}
              </button>
            ))}
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>

      <form
        id={formId}
        onSubmit={onSubmit}
        className={embed ? "mt-3 shrink-0 pt-2" : "sticky bottom-0 pt-3"}
      >
        <div className="flex items-center gap-2 rounded-[28px] border border-[var(--musai-border)] bg-[var(--musai-surface-2)] px-3 py-2 shadow-[var(--musai-shadow)]">
          <label className="sr-only" htmlFor={`${formId}-input`}>
            Message
          </label>
          <textarea
            id={`${formId}-input`}
            rows={1}
            value={draft}
            disabled={!bootDone || busy}
            placeholder="Ask anything"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-[15px] leading-6 text-[var(--musai-ink)] outline-none placeholder:text-[var(--musai-muted)] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--musai-accent)] text-[#fffcf8] transition enabled:hover:brightness-105 disabled:opacity-40"
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
