import { NextResponse } from "next/server";
import {
  buildScaleCoachingLlmPayload,
  type ScaleCoachingLlmPayload,
} from "@/lib/scaleCoachingLlm";
import { ensureBulletFeedback, takeCoachBullets } from "@/lib/scalePracticeCopy";
import { parseScalePracticeSession } from "@/lib/scalePracticeSession";

export const runtime = "nodejs";

type CoachingResponse = {
  tip: string;
  trendLine: string;
  source: "llm" | "template";
};

function templateReply(payload: ScaleCoachingLlmPayload): CoachingResponse {
  return {
    tip: takeCoachBullets(ensureBulletFeedback(payload.templateTip), 2),
    trendLine: "",
    source: "template",
  };
}

/** Scale opener is always the short template. LLM chat stays on /api/scale-coach-chat. */
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

  return NextResponse.json(templateReply(buildScaleCoachingLlmPayload(session)));
}
