"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import {
  localCoachChatReply,
  buildScaleCoachChatContext,
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
  error?: string;
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

function SourceBadge({
  source,
  error,
}: {
  source: ReplySource;
  error?: string;
}) {
  const isAi = source === "llm";
  return (
    <div className="mt-2 space-y-1">
      <p
        className={`text-[11px] font-medium tracking-wide ${
          isAi ? "text-[var(--musai-ok)]" : "text-[var(--musai-warn)]"
        }`}
      >
        {isAi ? "AI" : "Template"}
        {!isAi ? " · not live AI" : null}
      </p>
      {!isAi && error ? (
        <p className="text-[11px] leading-snug text-[var(--musai-muted)]">
          {/quota|429|billing/i.test(error)
            ? "OpenAI quota or billing blocked the AI. Add billing at platform.openai.com, then retry."
            : error.slice(0, 160)}
        </p>
      ) : null}
    </div>
  );
}

function AssistantTurn({
  text,
  stream,
  showThinking,
  source,
  error,
  onStreamDone,
}: {
  text: string;
  stream: boolean;
  showThinking: boolean;
  source: ReplySource;
  error?: string;
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
        <>
          <ul className="list-none space-y-2.5 text-[16px] leading-7 text-[var(--musai-ink)]">
            {lines.map((line, i) => {
              const body = line.replace(/^•\s*/, "");
              const isLast = i === lines.length - 1;
              return (
                <li key={`${i}-${body.slice(0, 12)}`} className="flex gap-2.5">
                  <span className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--musai-accent)]" aria-hidden />
                  <span className="min-w-0 flex-1 whitespace-pre-wrap">
                    {body}
                    {typing && isLast ? <StreamingCaret /> : null}
                  </span>
                </li>
              );
            })}
          </ul>
          {phase === "done" ? <SourceBadge source={source} error={error} /> : null}
        </>
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
  initialError?: string | null;
  /** Embed beside the staff on results (fills column, no top rule). */
  embed?: boolean;
};

/**
 * Live coach chat: measured-take LLM replies when key works, labeled AI vs Template.
 */
export function CoachChatPanel({
  start,
  trendLine,
  tip,
  source: initialSource,
  session,
  initialError = null,
  embed = false,
}: Props) {
  const reduce = usePrefersReducedMotion();
  const formId = useId();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [messages, setMessages] = useState<ThreadMsg[]>([]);
  const [bootDone, setBootDone] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(initialError);

  useEffect(() => {
    setBannerError(initialError);
  }, [initialError]);

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
        error: initialError ?? undefined,
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

    const userMsg: UserMsg = {
      id: `u-${Date.now()}`,
      role: "user",
      text: userText,
    };
    const historyForApi = [...messages, userMsg].map((m) => ({
      role: m.role,
      text: m.text,
    }));

    setDraft("");
    setBusy(true);
    setAwaitingReply(true);
    setMessages((prev) => [...prev, userMsg]);

    const ctx = buildScaleCoachChatContext(session, tip, trendLine);
    let answer = localCoachChatReply(userText, ctx);
    let replySource: ReplySource = "template";
    let replyError: string | undefined;

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
          error?: string;
        };
        if (typeof data.reply === "string" && data.reply.trim()) {
          answer = ensureBulletFeedback(data.reply);
        }
        if (data.source === "llm" || data.source === "template") {
          replySource = data.source;
        }
        if (typeof data.error === "string" && data.error.trim()) {
          replyError = data.error;
          setBannerError(data.error);
        } else if (replySource === "llm") {
          setBannerError(null);
        }
      } else {
        replyError = `Chat API HTTP ${res.status}`;
      }
    } catch (err) {
      replyError = err instanceof Error ? err.message : "Chat request failed";
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
        error: replyError,
      },
    ]);
  }

  if (!start) return null;

  const canSend = bootDone && !busy && Boolean(draft.trim());

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
            Coach
          </p>
        ) : null}
        {bannerError ? (
          <div className="rounded-[var(--musai-radius)] border border-[color-mix(in_srgb,var(--musai-warn)_35%,var(--musai-border))] bg-[color-mix(in_srgb,var(--musai-warn)_10%,white)] px-3.5 py-2.5 text-[12px] leading-snug text-[var(--musai-warn)]">
            {/quota|429|billing/i.test(bannerError)
              ? "Live AI is off: OpenAI says this key is out of quota. Add billing at platform.openai.com/account/billing, then send another message."
              : `Live AI is off: ${bannerError.slice(0, 180)}`}
          </div>
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
              source={msg.source}
              error={msg.error}
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
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <path d="M12 19V5M12 5l-5 5M12 5l5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </form>
    </div>
  );
}
