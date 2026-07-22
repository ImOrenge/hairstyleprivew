import { NextResponse } from "next/server";
import {
  dispatchGenerationOriginalCleanups,
  requestGenerationOriginalCleanup,
} from "../../../../../lib/generation-original-cleanup-outbox";
import { hasValidGenerationWorkflowCallbackSecret } from "../../../../../lib/generation-workflow-callback-auth";
import { getSupabaseAdminClient } from "../../../../../lib/supabase";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Params) {
  if (!(await hasValidGenerationWorkflowCallbackSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: generationId } = await params;
  const supabase = getSupabaseAdminClient();
  const { data: generation, error } = await supabase
    .from("generations")
    .select("user_id")
    .eq("id", generationId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!generation || typeof generation.user_id !== "string") {
    return NextResponse.json({ error: "Generation not found" }, { status: 404 });
  }

  try {
    const cleanup = await requestGenerationOriginalCleanup({
      generationId,
      userId: generation.user_id,
      reason: "all_variants_completed",
    }, supabase);
    const dispatch = cleanup.cleanupId
      ? await dispatchGenerationOriginalCleanups({ cleanupId: cleanup.cleanupId, limit: 1, client: supabase })
      : null;

    return NextResponse.json({
      generationId,
      cleanup,
      dispatch,
      removed: cleanup.cleanupStatus === "deleted" || Boolean(dispatch?.deleted),
    });
  } catch (cleanupError) {
    const message = cleanupError instanceof Error ? cleanupError.message : "Original cleanup failed";
    if (/still requires its original|active variant attempt|not terminal/i.test(message)) {
      return NextResponse.json({
        generationId,
        removed: false,
        reason: "original_required_for_retry",
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
