import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  getGenerationCompletionNotificationState,
  toLegacyGenerationNotificationStatus,
} from "../../../../../lib/generation-notification-outbox";
import { readGenerationCreditReceipt } from "../../../../../lib/generation-credit-receipt";
import { readGenerationOriginalRetentionState } from "../../../../../lib/generation-original-retention";
import { getGenerationRetryPath } from "../../../../../lib/generation-retry-path";
import { dispatchGenerationWorkflowOutbox } from "../../../../../lib/generation-workflow-outbox";
import { getSupabaseAdminClient } from "../../../../../lib/supabase";

interface Params {
  params: Promise<{ id: string }>;
}

function countVariants(options: unknown) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    return { total: 0, completed: 0, failed: 0 };
  }
  const recommendationSet = (options as Record<string, unknown>).recommendationSet;
  if (!recommendationSet || typeof recommendationSet !== "object" || Array.isArray(recommendationSet)) {
    return { total: 0, completed: 0, failed: 0 };
  }
  const variants = (recommendationSet as Record<string, unknown>).variants;
  if (!Array.isArray(variants)) {
    return { total: 0, completed: 0, failed: 0 };
  }
  return variants.reduce(
    (counts, variant) => {
      counts.total += 1;
      if (variant && typeof variant === "object" && !Array.isArray(variant)) {
        const status = (variant as Record<string, unknown>).status;
        if (status === "completed") counts.completed += 1;
        if (status === "failed") counts.failed += 1;
      }
      return counts;
    },
    { total: 0, completed: 0, failed: 0 },
  );
}

export async function GET(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: generationId } = await params;
  const supabase = getSupabaseAdminClient();
  const { data: generation, error } = await supabase
    .from("generations")
    .select("id,user_id,status,options,original_image_path,updated_at,accepted_at,preparation_status,preparation_error,workflow_instance_id,workflow_started_at,completion_notification_status")
    .eq("id", generationId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!generation) {
    return NextResponse.json({ error: "Generation not found" }, { status: 404 });
  }
  if (generation.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const counts = countVariants(generation.options);
  const terminal = generation.status === "completed" || generation.status === "failed";
  if (
    process.env.NODE_ENV === "development" &&
    !terminal &&
    generation.accepted_at &&
    !generation.workflow_instance_id
  ) {
    await dispatchGenerationWorkflowOutbox({
      limit: 10,
      localBaseUrl: new URL(request.url).origin,
    }).catch((dispatchError) => {
      console.warn("[generation-status] Local Workflow dispatch was deferred", {
        generationId,
        error: dispatchError instanceof Error ? dispatchError.message : "Unknown dispatch error",
      });
    });
  }
  let workflowDispatch = null;
  try {
    const { data: outbox, error: outboxError } = await supabase
      .from("generation_workflow_outbox")
      .select("status,attempt_count,available_at,dispatched_at,updated_at")
      .eq("generation_id", generationId)
      .maybeSingle();
    if (outboxError) throw outboxError;
    workflowDispatch = outbox
      ? {
          status: outbox.status,
          attemptCount: outbox.attempt_count,
          availableAt: outbox.available_at,
          dispatchedAt: outbox.dispatched_at,
          updatedAt: outbox.updated_at,
        }
      : null;
  } catch (workflowDispatchError) {
    console.warn("Generation Workflow dispatch state could not be read", {
      generationId,
      error:
        workflowDispatchError instanceof Error
          ? workflowDispatchError.message
          : "Unknown Workflow outbox read error",
    });
    workflowDispatch = {
      status: "unavailable",
      attemptCount: 0,
      availableAt: null,
      dispatchedAt: null,
      updatedAt: null,
    };
  }
  let creditReceipt = null;
  let creditReceiptUnavailable = false;
  try {
    creditReceipt = await readGenerationCreditReceipt(
      supabase,
      generationId,
      userId,
    );
  } catch (creditReceiptError) {
    creditReceiptUnavailable = true;
    console.warn("Generation credit receipt could not be read", {
      generationId,
      error:
        creditReceiptError instanceof Error
          ? creditReceiptError.message
          : "Unknown credit receipt error",
    });
  }
  let notification = null;
  if (terminal) {
    try {
      notification = await getGenerationCompletionNotificationState(generationId, supabase);
    } catch (notificationError) {
      console.warn("Falling back to the legacy generation notification state", {
        generationId,
        error:
          notificationError instanceof Error
            ? notificationError.message
            : "Unknown outbox read error",
      });
    }
  }
  const originalRetention = await readGenerationOriginalRetentionState(supabase, {
    id: generationId,
    status: generation.status,
    options: generation.options,
    original_image_path: generation.original_image_path,
  });

  return NextResponse.json({
    generationId,
    status: generation.status,
    terminal,
    acceptedAt: generation.accepted_at,
    preparationStatus: generation.preparation_status || "ready",
    preparationError: generation.preparation_error,
    workflowInstanceId: generation.workflow_instance_id,
    workflowStartedAt: generation.workflow_started_at,
    workflowDispatch,
    variants: counts,
    updatedAt: generation.updated_at,
    creditReceipt,
    creditReceiptUnavailable,
    retryPath: getGenerationRetryPath(generation.options),
    originalRetention,
    notificationStatus: toLegacyGenerationNotificationStatus(
      notification,
      generation.completion_notification_status,
    ),
    notification: notification
      ? {
          status: notification.status,
          attemptCount: notification.attemptCount,
          maxAttempts: notification.maxAttempts,
          nextAttemptAt: ["pending", "sending", "retry_wait"].includes(
            notification.status,
          )
            ? notification.availableAt
            : null,
          sentAt: notification.sentAt,
          terminalAt: notification.terminalAt,
        }
      : null,
  });
}
