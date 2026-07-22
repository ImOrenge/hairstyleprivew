import { NextResponse } from "next/server";
import { isAuthorizedGenerationWorkflowCallback } from "../../../../lib/generation-workflow-callback-auth";
import {
  runStylingWorkflowAttempt,
  StylingWorkflowTerminalError,
} from "../../../../lib/styling-workflow-execution";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  if (!(await isAuthorizedGenerationWorkflowCallback(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const candidate = await request.json().catch(() => null);
  const body = candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate as Record<string, unknown>
    : {};
  const sessionId = body && typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const attemptId = body && typeof body.attemptId === "string" ? body.attemptId.trim() : "";
  const leaseToken = body && typeof body.leaseToken === "string" ? body.leaseToken.trim() : "";
  if (![sessionId, attemptId, leaseToken].every((value) => UUID_PATTERN.test(value))) {
    return NextResponse.json({ error: "Invalid styling Workflow payload" }, { status: 400 });
  }

  try {
    const result = await runStylingWorkflowAttempt({ sessionId, attemptId, leaseToken });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Styling generation failed";
    const status = error instanceof StylingWorkflowTerminalError ? 409 : 500;
    console.error("[styling/run] Workflow execution failed", { sessionId, attemptId, message });
    return NextResponse.json({ error: message }, { status });
  }
}
