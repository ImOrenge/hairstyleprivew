import { NextResponse } from "next/server";
import { isAuthorizedGenerationWorkflowCallback } from "../../../../lib/generation-workflow-callback-auth";
import { dispatchGenerationWorkflowOutbox } from "../../../../lib/generation-workflow-outbox";

interface DispatchRequest {
  limit?: number;
}

export async function POST(request: Request) {
  if (!(await isAuthorizedGenerationWorkflowCallback(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as DispatchRequest;
  const requestedLimit = typeof body.limit === "number" ? body.limit : 10;
  try {
    const summary = await dispatchGenerationWorkflowOutbox({
      limit: requestedLimit,
      localBaseUrl: new URL(request.url).origin,
    });
    if (summary.runtime === "unavailable") {
      return NextResponse.json(
        {
          error: "Generation Workflow binding is unavailable",
          code: "GENERATION_WORKFLOW_UNAVAILABLE",
          ...summary,
        },
        { status: 503 },
      );
    }
    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Workflow dispatch failed" },
      { status: 500 },
    );
  }
}
