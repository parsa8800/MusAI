import { NextResponse } from "next/server";
import { isOpenAiLlmEnabled } from "@/lib/openaiEnabled";
import {
  buildScaleCoachChatContext,
  localCoachChatReply,
  scaleCoachChatDataMessage,
  scaleCoachChatSystemPrompt,
  type CoachChatMessage,
  type ScaleCoachChatContext,
} from "@/lib/scaleCoachChat";
import { ensureBulletFeedback } from "@/lib/scalePracticeCopy";
import { parseScalePracticeSession } from "@/lib/scalePracticeSession";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";

export const runtime = "nodejs";

type ChatBody = {
  session?: ScalePracticeSessionV1;
  tip?: string;
  trendLine?: string;
  messages?: CoachChatMessage[];
};

function parseReplyJson(raw: string): string | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as {
      reply?: string;
    };
    return typeof parsed.reply === "string" ? parsed.reply.trim() : null;
  } catch {
    return null;
  }
}

async function callOpenAiChat(
  ctx: ScaleCoachChatContext,
  history: CoachChatMessage[],
  apiKey: string,
): Promise<{ reply: string } | { error: string }> {
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const recent = history.slice(-12).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.text,
  }));

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.55,
        max_tokens: 220,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: scaleCoachChatSystemPrompt() },
          { role: "system", content: scaleCoachChatDataMessage(ctx) },
          ...recent,
        ],
      }),
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Network error calling OpenAI",
    };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      error: `OpenAI HTTP ${res.status}: ${body.slice(0, 180) || res.statusText}`,
    };
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return { error: "OpenAI returned empty content" };
  const reply = parseReplyJson(content);
  if (!reply) return { error: "OpenAI reply was not valid JSON with reply" };
  return { reply: ensureBulletFeedback(reply.slice(0, 360)) };
}

export async function POST(req: Request) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const session = parseScalePracticeSession(body.session);
  const tip = typeof body.tip === "string" ? body.tip : "";
  const trendLine = typeof body.trendLine === "string" ? body.trendLine : "";
  const messages = Array.isArray(body.messages) ? body.messages : [];

  if (!session) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser?.text?.trim()) {
    return NextResponse.json({ error: "Missing user message" }, { status: 400 });
  }

  const ctx = buildScaleCoachChatContext(session, tip, trendLine);
  const fallback = localCoachChatReply(lastUser.text, ctx);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const llmEnabled = isOpenAiLlmEnabled();

  if (!apiKey || !llmEnabled) {
    return NextResponse.json({
      reply: fallback,
      source: "template" as const,
      error: !apiKey
        ? "No OPENAI_API_KEY in server env"
        : "OPENAI_ENABLED is off (template mode)",
    });
  }

  const llm = await callOpenAiChat(ctx, messages, apiKey);
  if ("reply" in llm) {
    return NextResponse.json({ reply: llm.reply, source: "llm" as const });
  }

  console.error("[scale-coach-chat] LLM failed:", llm.error);
  return NextResponse.json({
    reply: fallback,
    source: "template" as const,
    error: llm.error,
  });
}
