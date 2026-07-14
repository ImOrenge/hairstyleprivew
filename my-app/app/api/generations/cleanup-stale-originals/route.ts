import { NextResponse } from "next/server";
import { removeGenerationOriginalImage } from "../../../../lib/generation-image-storage";
import { getGenerationWorkflowBinding } from "../../../../lib/generation-workflow";
import { getSupabaseAdminClient } from "../../../../lib/supabase";

const STALE_ORIGINAL_AGE_MS = 24 * 60 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 100;

function isAuthorized(request: Request) {
  const expected = process.env.GENERATION_WORKFLOW_CALLBACK_SECRET?.trim();
  const supplied = request.headers.get("x-hairfit-generation-secret")?.trim();
  return Boolean(expected && supplied && expected === supplied);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - STALE_ORIGINAL_AGE_MS).toISOString();
  const supabase = getSupabaseAdminClient();
  const { data: generations, error } = await supabase
    .from("generations")
    .select("id,status,workflow_instance_id,original_image_path")
    .like("original_image_path", "originals/%")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(CLEANUP_BATCH_SIZE);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let removedCount = 0;
  let protectedCount = 0;
  const failures: Array<{ generationId: string; error: string }> = [];
  const workflow = await getGenerationWorkflowBinding();
  for (const generation of generations ?? []) {
    const generationId = typeof generation.id === "string" ? generation.id : "";
    const originalPath =
      typeof generation.original_image_path === "string" ? generation.original_image_path : "";
    if (!generationId || !originalPath) continue;

    const terminal = generation.status === "completed" || generation.status === "failed";
    const workflowInstanceId =
      typeof generation.workflow_instance_id === "string" ? generation.workflow_instance_id : null;
    let abandoned = !workflowInstanceId;
    if (!terminal && workflowInstanceId && workflow) {
      try {
        const instance = await workflow.get(workflowInstanceId);
        const instanceStatus = await instance.status();
        abandoned = instanceStatus.status === "errored" || instanceStatus.status === "terminated";
      } catch (workflowError) {
        failures.push({
          generationId,
          error: workflowError instanceof Error
            ? `Workflow status check failed: ${workflowError.message}`
            : "Workflow status check failed",
        });
        continue;
      }
    }

    if (!terminal && !abandoned) {
      protectedCount += 1;
      continue;
    }

    try {
      await removeGenerationOriginalImage(supabase, originalPath);
      const { error: markerError } = await supabase
        .from("generations")
        .update({ original_image_path: `deleted-original://${generationId}` })
        .eq("id", generationId);
      if (markerError) throw new Error(markerError.message);
      removedCount += 1;
    } catch (cleanupError) {
      failures.push({
        generationId,
        error: cleanupError instanceof Error ? cleanupError.message : "Unknown cleanup error",
      });
    }
  }

  return NextResponse.json({
    cutoff,
    scannedCount: generations?.length ?? 0,
    removedCount,
    protectedCount,
    failures,
  });
}
