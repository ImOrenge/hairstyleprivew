import { NextResponse } from "next/server";
import { isAuthorizedGenerationWorkflowCallback } from "../../../../lib/generation-workflow-callback-auth";
import { dispatchStylingWorkflowOutbox } from "../../../../lib/styling-workflow-outbox";

export async function POST(request: Request) {
  if (!(await isAuthorizedGenerationWorkflowCallback(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const candidate = await request.json().catch(() => null);
  const body = candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate as Record<string, unknown>
    : {};
  const limit = body && typeof body.limit === "number" ? body.limit : 10;
  try {
    const summary = await dispatchStylingWorkflowOutbox({
      limit,
      localBaseUrl: new URL(request.url).origin,
    });
    if (summary.runtime === "unavailable") {
      return NextResponse.json(
        { error: "Styling Workflow binding is unavailable", code: "STYLING_WORKFLOW_UNAVAILABLE", ...summary },
        { status: 503 },
      );
    }
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Styling Workflow dispatch failed" },
      { status: 500 },
    );
  }
}
