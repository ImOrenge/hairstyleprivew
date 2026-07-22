import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  createGenerationWorkflowInstance,
  getGenerationWorkflowBinding,
} from "../../../../lib/generation-workflow";
import { dispatchGenerationWorkflowOutbox } from "../../../../lib/generation-workflow-outbox";
import {
  getGenerationCompletionNotificationState,
  toLegacyGenerationNotificationStatus,
} from "../../../../lib/generation-notification-outbox";
import { getSupabaseAdminClient } from "../../../../lib/supabase";

interface StartGenerationRequest {
  generationId?: string;
}

const uuidV4LikeRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getVariantCount(options: unknown) {
  if (!options || typeof options !== "object" || Array.isArray(options)) return 0;
  const recommendationSet = (options as Record<string, unknown>).recommendationSet;
  if (!recommendationSet || typeof recommendationSet !== "object" || Array.isArray(recommendationSet)) {
    return 0;
  }
  const variants = (recommendationSet as Record<string, unknown>).variants;
  return Array.isArray(variants) ? variants.length : 0;
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as StartGenerationRequest;
  const generationId = body.generationId?.trim() || "";
  if (!uuidV4LikeRegex.test(generationId)) {
    return NextResponse.json({ error: "generationId must be a valid UUID" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: generation, error: generationError } = await supabase
    .from("generations")
    .select("id,user_id,status,options,accepted_at,preparation_status,workflow_instance_id,completion_notification_status")
    .eq("id", generationId)
    .maybeSingle();

  if (generationError) {
    return NextResponse.json({ error: generationError.message }, { status: 500 });
  }
  if (!generation) {
    return NextResponse.json({ error: "Generation not found" }, { status: 404 });
  }
  if (generation.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const terminal = generation.status === "completed" || generation.status === "failed";
  const workflowInstanceId =
    typeof generation.workflow_instance_id === "string" ? generation.workflow_instance_id : null;
  if (terminal) {
    let notification = null;
    try {
      notification = await getGenerationCompletionNotificationState(generationId, supabase);
    } catch (error) {
      console.warn("Falling back to the legacy generation notification state", {
        generationId,
        error: error instanceof Error ? error.message : "Unknown outbox read error",
      });
    }

    return NextResponse.json(
      {
        generationId,
        status: generation.status,
        terminal: true,
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
      },
      { status: 200 },
    );
  }

  const variantCount = getVariantCount(generation.options);
  const durableAcceptance = Boolean(generation.accepted_at);
  const preparationStatus =
    typeof generation.preparation_status === "string"
      ? generation.preparation_status
      : "ready";
  if (variantCount === 0 && !durableAcceptance) {
    return NextResponse.json({ error: "Recommendation variants not found" }, { status: 409 });
  }

  if (durableAcceptance && !workflowInstanceId) {
    const dispatch = await dispatchGenerationWorkflowOutbox({
      limit: 10,
      localBaseUrl: new URL(request.url).origin,
    }).catch((error) => ({
      bindingAvailable: false,
      claimed: 0,
      dispatched: 0,
      deferred: 1,
      generationIds: [] as string[],
      errors: [{
        generationId,
        error: error instanceof Error ? error.message : "Workflow dispatch was deferred",
      }],
    }));
    return NextResponse.json(
      {
        generationId,
        acceptedAt: generation.accepted_at,
        preparationStatus,
        workflowStatus:
          dispatch.generationIds.includes(generationId) && dispatch.dispatched > 0
            ? "dispatched"
            : "queued",
        status: generation.status,
        alreadyStarted: true,
      },
      { status: 202 },
    );
  }

  const workflow = await getGenerationWorkflowBinding();
  if (!workflow) {
    return NextResponse.json(
      {
        error: "Background generation is unavailable in this runtime",
        code: "GENERATION_WORKFLOW_UNAVAILABLE",
      },
      { status: 503 },
    );
  }

  if (workflowInstanceId) {
    try {
      const instance = await workflow.get(workflowInstanceId);
      const instanceStatus = await instance.status();
      const restartable = instanceStatus.status === "errored" || instanceStatus.status === "terminated";
      if (restartable) {
        const { error: restartPrepareError } = await supabase
          .from("generations")
          .update({
            workflow_started_at: new Date().toISOString(),
            completion_notification_status: "pending",
            completion_notification_error: null,
          })
          .eq("id", generationId);
        if (restartPrepareError) {
          return NextResponse.json({ error: restartPrepareError.message }, { status: 500 });
        }
        await instance.restart();
      }

      if (instanceStatus.status === "unknown") {
        const { error: recreatePrepareError } = await supabase
          .from("generations")
          .update({
            workflow_started_at: new Date().toISOString(),
            completion_notification_status: "pending",
            completion_notification_error: null,
          })
          .eq("id", generationId);
        if (recreatePrepareError) {
          return NextResponse.json({ error: recreatePrepareError.message }, { status: 500 });
        }
        const recreated = await createGenerationWorkflowInstance(workflow, {
          generationId,
          ...(variantCount > 0 ? { variantCount } : {}),
        });
        return NextResponse.json(
          {
            generationId,
            workflowInstanceId: recreated.id || generationId,
            workflowStatus: "recreated",
            status: generation.status,
            alreadyStarted: true,
          },
          { status: 202 },
        );
      }

      return NextResponse.json(
        {
          generationId,
          workflowInstanceId,
          workflowStatus: restartable ? "restarted" : instanceStatus.status,
          status: generation.status,
          alreadyStarted: true,
        },
        { status: 202 },
      );
    } catch (error) {
      try {
        const recreated = await createGenerationWorkflowInstance(workflow, {
          generationId,
          ...(variantCount > 0 ? { variantCount } : {}),
        });
        return NextResponse.json(
          {
            generationId,
            workflowInstanceId: recreated.id || generationId,
            workflowStatus: "recreated",
            status: generation.status,
            alreadyStarted: true,
          },
          { status: 202 },
        );
      } catch (recreateError) {
        const inspectMessage = error instanceof Error ? error.message : "Failed to inspect generation workflow";
        const recreateMessage = recreateError instanceof Error
          ? recreateError.message
          : "Failed to recreate generation workflow";
        return NextResponse.json(
          { error: `${inspectMessage}; ${recreateMessage}` },
          { status: 502 },
        );
      }
    }
  }

  const { error: prepareError } = await supabase
    .from("generations")
    .update({
      workflow_instance_id: generationId,
      workflow_started_at: new Date().toISOString(),
      completion_notification_status: "pending",
      completion_notification_error: null,
    })
    .eq("id", generationId);

  if (prepareError) {
    return NextResponse.json({ error: prepareError.message }, { status: 500 });
  }

  try {
    const instance = await createGenerationWorkflowInstance(workflow, {
      generationId,
      ...(variantCount > 0 ? { variantCount } : {}),
    });
    return NextResponse.json(
      {
        generationId,
        workflowInstanceId: instance.id || generationId,
        status: "queued",
      },
      { status: 202 },
    );
  } catch (error) {
    try {
      const existing = await workflow.get(generationId);
      const existingStatus = await existing.status();
      if (existingStatus.status === "unknown") {
        throw new Error("Workflow instance was not created");
      }
      return NextResponse.json(
        {
          generationId,
          workflowInstanceId: existing.id || generationId,
          status: "queued",
          alreadyStarted: true,
        },
        { status: 202 },
      );
    } catch {
      const message = error instanceof Error ? error.message : "Failed to start generation workflow";
      const { error: resetError } = await supabase
        .from("generations")
        .update({
          workflow_instance_id: null,
          workflow_started_at: null,
          completion_notification_status: "not_requested",
          completion_notification_error: message,
        })
        .eq("id", generationId);
      if (resetError) {
        return NextResponse.json(
          { error: `${message}; failed to reset workflow marker: ${resetError.message}` },
          { status: 500 },
        );
      }
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }
}
