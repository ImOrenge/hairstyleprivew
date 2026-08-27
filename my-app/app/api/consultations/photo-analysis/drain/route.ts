import { NextResponse, after } from "next/server";
import { isAuthorizedGenerationWorkflowCallback } from "../../../../../lib/generation-workflow-callback-auth";
import { drainConsultationPhotoAnalyses } from "../../../../../lib/consulting/photo-analysis-server";

export async function POST(request: Request) {
  if (!(await isAuthorizedGenerationWorkflowCallback(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { limit?: unknown };
  const limit = Number.isInteger(body.limit) ? Number(body.limit) : 2;
  after(() => drainConsultationPhotoAnalyses(limit));
  return NextResponse.json({ accepted: true, limit }, { status: 202 });
}
