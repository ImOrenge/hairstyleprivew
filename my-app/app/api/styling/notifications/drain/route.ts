import { NextResponse } from "next/server";
import { hasValidGenerationWorkflowCallbackSecret } from "../../../../../lib/generation-workflow-callback-auth";
import { dispatchStylingCompletionNotifications } from "../../../../../lib/styling-notification-outbox";

function boundedInteger(value: unknown, fallback: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(Math.max(Math.trunc(value), 1), maximum)
    : fallback;
}

export async function POST(request: Request) {
  if (!(await hasValidGenerationWorkflowCallbackSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const candidate = await request.json().catch(() => null);
  const body = candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate as Record<string, unknown>
    : {};
  try {
    const dispatch = await dispatchStylingCompletionNotifications({
      limit: boundedInteger(body.limit, 25, 100),
      concurrency: boundedInteger(body.concurrency, 5, 10),
    });
    return NextResponse.json(dispatch);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Styling notification drain failed" },
      { status: 500 },
    );
  }
}
