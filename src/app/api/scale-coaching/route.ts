import { NextResponse } from "next/server";
import { isOpenAiLlmEnabled } from "@/lib/openaiEnabled";
import {
  buildScaleCoachingLlmPayload,
  scaleCoachingSystemPrompt,
  type ScaleCoachingLlmPayload,
} from "@/lib/scaleCoachingLlm";
import { ensureBulletFeedback } from "@/lib/scalePracticeCopy";
import { parseScalePracticeSession } from "@/lib/scalePracticeSession";


export const runtime = "nodejs";

type CoachingResponse = {
  tip: string;
  trendLine: string;
  source: "llm" | "template";
};

function templateReply(payload: ScaleCoachingLlmPayload): CoachingResponse {
  return {
    tip: ensureBulletFeedback(payload.templateTip),
    trendLine: ensureBulletFeedback(payload.templateTrend),
    source: "template",
  };
}

function parseModelJson(raw: string): { tip?: string; trendLine?: string } | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as {
      tip?: string;
      trendLine?: string;
    };
  } catch {
    return null;
  }
}

async function callOpenAi(
  payload: ScaleCoachingLlmPayload,
  apiKey: string,
): Promise<CoachingResponse | { error: string }> {
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
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
        temperature: 0.4,
        max_tokens: 120,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: scaleCoachingSystemPrompt() },
          {
            role: "user",
            content: JSON.stringify(payload),
          },
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
  const parsed = parseModelJson(content);
  if (!parsed?.tip || !parsed?.trendLine) {
    return { error: "OpenAI reply missing tip/trendLine" };
  }
  return {
    tip: ensureBulletFeedback(parsed.tip.trim().slice(0, 220)),
    trendLine: ensureBulletFeedback(parsed.trendLine.trim().slice(0, 160)),
    source: "llm",
  };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const session = parseScalePracticeSession(
    (body as { session?: unknown }).session,
  );
  if (!session) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }

  const payload = buildScaleCoachingLlmPayload(session);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const llmEnabled = isOpenAiLlmEnabled();

  if (!apiKey || !llmEnabled) {
    return NextResponse.json({
      ...templateReply(payload),
      error: !apiKey
        ? "No OPENAI_API_KEY in server env"
        : "OPENAI_ENABLED is off (template mode)",
    });
  }

  const llm = await callOpenAi(payload, apiKey);
  if ("source" in llm && llm.source === "llm") {
    return NextResponse.json(llm);
  }

  const error = "error" in llm ? llm.error : "OpenAI request failed";
  console.error("[scale-coaching] LLM failed:", error);
  return NextResponse.json({
    ...templateReply(payload),
    error,
  });
}
