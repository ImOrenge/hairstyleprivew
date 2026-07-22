import { NextResponse } from "next/server";
import { isAuthorizedGenerationWorkflowCallback } from "../../../../../lib/generation-workflow-callback-auth";
import { dispatchStylingCompletionNotifications } from "../../../../../lib/styling-notification-outbox";

interface Params {
  params: Promise<{ id: string }>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: Params) {
  if (!(await isAuthorizedGenerationWorkflowCallback(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "sessionId must be a valid UUID" }, { status: 400 });
  }
  try {
    const dispatch = await dispatchStylingCompletionNotifications({
      sessionId: id,
      limit: 1,
      concurrency: 1,
    });
    return NextResponse.json(dispatch);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Styling notification failed" },
      { status: 500 },
    );
  }
}
