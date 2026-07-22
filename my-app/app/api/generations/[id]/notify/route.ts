import { NextResponse } from "next/server";
import { dispatchGenerationCompletionNotifications } from "../../../../../lib/generation-notification-outbox";
import { dispatchGenerationPushNotifications } from "../../../../../lib/generation-push-notifications";
import { hasValidGenerationWorkflowCallbackSecret } from "../../../../../lib/generation-workflow-callback-auth";

interface Params {
  params: Promise<{ id: string }>;
}

const uuidV4LikeRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: Params) {
  if (!(await hasValidGenerationWorkflowCallbackSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: generationId } = await params;
  if (!uuidV4LikeRegex.test(generationId)) {
    return NextResponse.json({ error: "generationId must be a valid UUID" }, { status: 400 });
  }

  try {
    const dispatch = await dispatchGenerationCompletionNotifications({
      generationId,
      limit: 1,
      concurrency: 1,
      reconcile: false,
    });
    const push = await dispatchGenerationPushNotifications({
      generationId,
      sendLimit: 25,
      receiptLimit: 25,
    }).catch((error) => {
      console.error("[generations/notify] push dispatch deferred", {
        generationId,
        error: error instanceof Error ? error.message : "Unknown push error",
      });
      return null;
    });

    return NextResponse.json({
      generationId,
      accepted: true,
      claimedCount: dispatch.claimedCount,
      results: dispatch.results,
      push,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Notification dispatch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
