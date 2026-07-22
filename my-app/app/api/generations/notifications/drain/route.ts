import { NextResponse } from "next/server";
import { dispatchGenerationCompletionNotifications } from "../../../../../lib/generation-notification-outbox";
import {
  emitGenerationNotificationOperationAlerts,
  loadGenerationNotificationOperations,
} from "../../../../../lib/generation-notification-operations";
import { dispatchGenerationPushNotifications } from "../../../../../lib/generation-push-notifications";
import { hasValidGenerationWorkflowCallbackSecret } from "../../../../../lib/generation-workflow-callback-auth";
import { getSupabaseAdminClient } from "../../../../../lib/supabase";

function boundedInteger(value: unknown, fallback: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), 1), maximum);
}

export async function HEAD(request: Request) {
  if (!(await hasValidGenerationWorkflowCallbackSecret(request))) {
    return new Response(null, { status: 401 });
  }
  return new Response(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!(await hasValidGenerationWorkflowCallbackSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const candidate = await request.json().catch(() => null);
  const body = candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? (candidate as Record<string, unknown>)
    : {};
  const limit = boundedInteger(body.limit, 25, 100);
  const concurrency = boundedInteger(body.concurrency, 5, 10);

  try {
    const dispatch = await dispatchGenerationCompletionNotifications({
      limit,
      concurrency,
      reconcile: true,
    });
    const push = await dispatchGenerationPushNotifications({
      sendLimit: limit,
      receiptLimit: Math.min(limit * 4, 1000),
    }).catch((error) => {
      console.error("[generations/notifications/drain] push dispatch deferred", {
        error: error instanceof Error ? error.message : "Unknown push error",
      });
      return null;
    });
    const operations = await loadGenerationNotificationOperations(getSupabaseAdminClient())
      .then((snapshot) => {
        emitGenerationNotificationOperationAlerts(snapshot);
        return snapshot;
      })
      .catch((error) => {
        console.error("[generations/notifications/drain] operations snapshot unavailable", {
          error: error instanceof Error ? error.message : "Unknown operations error",
        });
        return null;
      });
    return NextResponse.json({ ...dispatch, push, operations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Notification drain failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
