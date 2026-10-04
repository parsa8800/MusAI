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
import {
  readCoachMemory,
  writeCoachMessages,
  type CoachMemoryMessage,
} from "@/lib/coachThreadMemory";
import { formatCoachReadability } from "@/lib/coachReadability";
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
    <div
      className={`musai-coach-turn musai-coach-turn--you${
        compact ? " musai-coach-turn--compact" : ""
      }`}
    >
      <p className="musai-coach-turn__who">You</p>
      <div className="musai-coach-turn__bubble">{text}</div>
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
          ? "musai-coach-prompts musai-coach-prompts--embed musai-coach-prompts--stack"
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
          <span className="musai-coach-prompt__text">{q}</span>
          <svg
            className="musai-coach-prompt__go"
            viewBox="0 0 16 16"
            aria-hidden="true"
          >
            <path
              d="M6 3.5 10.5 8 6 12.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
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

type CoachMessageRow =
  | {
      type: "line";
      kind: "lead" | "practise" | "next" | "aside" | "point" | "body";
      body: string;
    }
  | { type: "list"; variant: "dots" | "steps"; items: string[] };

function coachMessageRows(display: string): CoachMessageRow[] {
  const lines = display.split("\n").filter(Boolean);
  const rows: CoachMessageRow[] = [];
  for (const line of lines) {
    const bullet = /^•\s*(.*)$/.exec(line);
    const step = /^\d+\.\s*(.*)$/.exec(line);
    if (bullet) {
      const last = rows[rows.length - 1];
      if (last?.type === "list" && last.variant === "dots") last.items.push(bullet[1]);
      else rows.push({ type: "list", variant: "dots", items: [bullet[1]] });
      continue;
    }
    if (step) {
      const last = rows[rows.length - 1];
      if (last?.type === "list" && last.variant === "steps") last.items.push(step[1]);
      else rows.push({ type: "list", variant: "steps", items: [step[1]] });
      continue;
    }
    rows.push({
      type: "line",
      kind: coachMessageLineKind(line),
      body: line.replace(/^•\s*/, ""),
    });
  }
  return rows;
}

function coachMessageLineKind(line: string): "lead" | "practise" | "next" | "aside" | "point" | "body" {
  const trimmed = line.replace(/^•\s*/, "").trim();
  if (/^start here:/i.test(trimmed)) return "lead";
  if (/^try:/i.test(trimmed) || /^first:/i.test(trimmed)) return "practise";
  if (/^then:/i.test(trimmed)) return "next";
  if (/^we.?ll leave/i.test(trimmed) || /^keep looping/i.test(trimmed)) {
    return "aside";
  }
  if (/^•/.test(line.trim())) return "point";
  return "body";
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
  const readable = formatCoachReadability(text);
  const [phase, setPhase] = useState<"thinking" | "typing" | "done">(
    showThinking && !reduce ? "thinking" : stream && !reduce ? "typing" : "done",
  );
  const shown = useTypedText(readable, phase === "typing" || phase === "done");
  const doneRef = useRef(false);

  useEffect(() => {
    if (phase !== "thinking") return;
    const t = window.setTimeout(() => setPhase("typing"), 900);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "typing") return;
    if (reduce || shown.length >= readable.length) {
      setPhase("done");
    }
  }, [phase, shown, readable, reduce]);

  useEffect(() => {
    if (phase !== "done" || doneRef.current) return;
    doneRef.current = true;
    onStreamDone?.();
  }, [phase, onStreamDone]);

  const typing = phase === "typing" && shown.length < readable.length && !reduce;
  const display = reduce || phase === "done" ? readable : shown;
  const rows = coachMessageRows(display);

  return (
    <div className="musai-coach-turn musai-coach-turn--coach">
      <p className="musai-coach-turn__who">Coach</p>
      {phase === "thinking" ? (
        <ThinkingIndicator />
      ) : (
        <div className="musai-coach-turn__bubble">
          <div className="musai-coach-msg">
            {rows.map((row, i) => {
              const isLast = i === rows.length - 1;
              if (row.type === "list") {
                const ListTag = row.variant === "steps" ? "ol" : "ul";
                return (
                  <ListTag
                    key={`${row.variant}-${i}`}
                    className={`musai-coach-msg__list musai-coach-msg__list--${row.variant}`}
                  >
                    {row.items.map((item, itemIndex) => {
                      const lastItem = isLast && itemIndex === row.items.length - 1;
                      return (
                        <li key={`${itemIndex}-${item.slice(0, 12)}`}>
                          {item}
                          {typing && lastItem ? <StreamingCaret /> : null}
                        </li>
                      );
                    })}
                  </ListTag>
                );
              }
              return (
                <p
                  key={`${i}-${row.body.slice(0, 12)}`}
                  className={`musai-coach-msg__line musai-coach-msg__line--${row.kind}`}
                  data-coach-line={row.kind}
                >
                  {row.body}
                  {typing && isLast ? <StreamingCaret /> : null}
                </p>
              );
            })}
          </div>
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
  /** Two starters shown before the first message. Piece coach only. */
  idleSuggestions?: readonly string[];
  /** One follow-up shown after the student has asked something. */
  followSuggestion?: string | null;
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
  /** Shown in the empty message field. Piece uses the teacher wording. */
  placeholder?: string;
  /** Piece hides this so a rhythm note is not followed by a second title. */
  showHeader?: boolean;
  /** Shown at the top until the first message. Then the thread takes over. */
  emptyNote?: string;
  /** Content above the chat thread (e.g. Piece focus card). */
  topSlot?: ReactNode;
  /** When true, show the tiny preview status dot beside the title. */
  showPreviewDot?: boolean;
  /**
   * Keep the thread across remounts (Score ↔ Practise). Same key restores
   * the same messages.
   */
  threadKey?: string;
};

function restoredThread(threadKey: string | undefined): ThreadMsg[] {
  if (!threadKey) return [];
  return readCoachMemory(threadKey).messages.map((message) =>
    message.role === "user"
      ? { id: message.id, role: "user", text: message.text }
      : {
          id: message.id,
          role: "assistant",
          text: message.text,
          stream: false,
          source: "template" as const,
        },
  );
}

function memoryMessages(messages: readonly ThreadMsg[]): CoachMemoryMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    text: message.text,
  }));
}

const COACH_LISTEN_LINES = 22;

/**
 * Thin lines across the prompt while the mic is open.
 * Heights follow the live input so silence stays nearly flat.
 */
function CoachListenLines() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const bars = [...host.querySelectorAll<HTMLElement>("[data-line]")];
    if (bars.length === 0) return;

    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    let stopped = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    const shown = new Float32Array(bars.length);

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      } catch {
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      ctx = new AudioCtx();
      await ctx.resume();
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        void ctx.close();
        return;
      }
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const used = Math.min(data.length, 36);

      const tick = () => {
        if (stopped) return;
        analyser.getByteFrequencyData(data);
        for (let i = 0; i < bars.length; i += 1) {
          const idx = Math.min(
            used - 1,
            Math.round((i / Math.max(1, bars.length - 1)) * (used - 1)),
          );
          const target = (data[idx] ?? 0) / 255;
          shown[i] = shown[i]! * 0.55 + target * 0.45;
          const scale = 0.28 + shown[i]! * 0.72;
          bars[i]!.style.transform = `scaleY(${scale.toFixed(3)})`;
        }
        raf = window.requestAnimationFrame(tick);
      };
      raf = window.requestAnimationFrame(tick);
    })();

    return () => {
      stopped = true;
      window.cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
      void ctx?.close();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="musai-coach-listen"
      data-testid="coach-listen-lines"
      aria-hidden
    >
      {Array.from({ length: COACH_LISTEN_LINES }, (_, i) => (
        <span key={i} data-line="" className="musai-coach-listen__line" />
      ))}
    </div>
  );
}

/**
 * Shared Coach · Parsa chat chrome — domain-agnostic.
 * Scale and Piece adapters supply opener text + getReply.
 */
export function CoachParsaChat({
  start,
  openerText,
  source: initialSource = "template",
  suggestions = [],
  idleSuggestions,
  followSuggestion = null,
  getReply,
  sanitizeUserText = (raw) => raw.trim(),
  embed = false,
  title = "Coach · Parsa",
  placeholder = "Ask your coach...",
  showHeader = true,
  emptyNote,
  topSlot = null,
  showPreviewDot,
  threadKey,
}: CoachParsaChatProps) {
  const reduce = usePrefersReducedMotion();
  const formId = useId();
  const threadRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [messages, setMessages] = useState<ThreadMsg[]>(() => restoredThread(threadKey));
  const [bootDone, setBootDone] = useState(
    () => restoredThread(threadKey).length > 0,
  );
  const [coachSource, setCoachSource] = useState<CoachReplySource>(initialSource);
  const [inflate, setInflate] = useState(false);
  const bubbleSizeRef = useRef<CoachBubbleSize>("seed");
  const skipThreadSave = useRef(true);
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
      skipThreadSave.current = true;
      setMessages([]);
      setBootDone(false);
      setBusy(false);
      setAwaitingReply(false);
      setDraft("");
      return;
    }

    skipThreadSave.current = true;
    const saved = restoredThread(threadKey);
    if (saved.length > 0) {
      setMessages(saved);
      setBootDone(true);
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
  }, [start, openerText, initialSource, threadKey]);

  useEffect(() => {
    if (!threadKey || !bootDone) return;
    if (skipThreadSave.current) {
      skipThreadSave.current = false;
      return;
    }
    writeCoachMessages(threadKey, memoryMessages(messages));
  }, [threadKey, messages, bootDone]);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;

    const pin = () => {
      if (!stickToBottomRef.current) return;
      el.scrollTop = el.scrollHeight;
    };

    const onScroll = () => {
      const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = gap < 40;
    };

    const ro = new ResizeObserver(() => pin());
    ro.observe(el);
    const watch = (node: Element) => ro.observe(node);
    for (const child of el.children) watch(child);

    const mo = new MutationObserver(() => {
      for (const child of el.children) watch(child);
      pin();
    });
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    el.addEventListener("scroll", onScroll, { passive: true });
    pin();

    return () => {
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener("scroll", onScroll);
    };
  }, [start, embed]);

  useEffect(() => {
    stickToBottomRef.current = true;
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    const frame = window.requestAnimationFrame(() => {
      if (!stickToBottomRef.current) return;
      const node = threadRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, awaitingReply]);

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
  const asked = new Set(
    messages
      .filter((message) => message.role === "user")
      .map((message) => message.text.trim().toLowerCase()),
  );
  const quietPrompts = idleSuggestions != null;
  const hasUserMessage = messages.some((message) => message.role === "user");
  const visibleSuggestions = (
    quietPrompts
      ? hasUserMessage
        ? followSuggestion
          ? [followSuggestion]
          : []
        : [...idleSuggestions]
      : suggestions
  )
    .filter((question) => !asked.has(question.trim().toLowerCase()))
    .slice(0, quietPrompts ? (hasUserMessage ? 1 : 2) : 3);
  const showSuggestions =
    bootDone &&
    !busy &&
    !awaitingReply &&
    visibleSuggestions.length > 0;

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
      {embed && showHeader ? (
        <header className="musai-coach-header">
          <span className="musai-coach-header__avatar" aria-hidden>
            <svg viewBox="0 0 24 24">
              <path
                d="M5.5 6.75h13a1.75 1.75 0 0 1 1.75 1.75v7a1.75 1.75 0 0 1-1.75 1.75H11l-3.75 2.75V17.25H5.5A1.75 1.75 0 0 1 3.75 15.5v-7A1.75 1.75 0 0 1 5.5 6.75Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
              <path
                d="M8.25 11h.01M12 11h.01M15.75 11h.01"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
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
        ref={threadRef}
        className={
          embed
            ? `musai-scroll musai-coach-thread${
                messages.length === 0 ? " musai-coach-thread--quiet" : ""
              }`
            : "space-y-6 border-t border-[var(--musai-border)] pt-8"
        }
      >
        {messages.length === 0 && emptyNote ? (
          <div className="musai-coach-welcome flex w-full flex-col items-center text-center">
            <span className="musai-coach-welcome__mark" aria-hidden>
              <svg viewBox="0 0 24 24">
                <path
                  d="M5.5 6.75h13a1.75 1.75 0 0 1 1.75 1.75v7a1.75 1.75 0 0 1-1.75 1.75H11l-3.75 2.75V17.25H5.5A1.75 1.75 0 0 1 3.75 15.5v-7A1.75 1.75 0 0 1 5.5 6.75Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <p className="musai-coach-welcome__title w-full text-center">{title}</p>
            <p className="musai-coach-welcome__line w-full text-center">{emptyNote}</p>
          </div>
        ) : null}

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

        {awaitingReply ? (
          <div className="musai-coach-turn musai-coach-turn--coach">
            <p className="musai-coach-turn__who">Coach</p>
            <ThinkingIndicator />
          </div>
        ) : null}
      </div>

      {showSuggestions ? (
        <PromptChips
          questions={visibleSuggestions}
          disabled={!bootDone || busy}
          onPick={(q) => void sendUserMessage(q)}
          pad={embed ? "embed" : "page"}
        />
      ) : null}

      <form
        id={formId}
        onSubmit={onSubmit}
        className={
          embed ? "musai-coach-composer musai-coach-composer--embed" : "musai-coach-composer"
        }
      >
        <div
          className="musai-coach-composer__field"
          data-listening={speech.listening ? "true" : "false"}
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
          {speech.listening ? <CoachListenLines /> : null}
          <textarea
            id={`${formId}-input`}
            rows={1}
            value={draft}
            disabled={!bootDone || busy}
            placeholder={placeholder}
            aria-label={speech.listening ? "Listening" : "Message"}
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
