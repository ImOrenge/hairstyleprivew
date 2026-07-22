import { NextResponse } from "next/server";
import {
  dispatchGenerationOriginalCleanups,
  expireGenerationUploadDrafts,
  queueExpiredGenerationOriginals,
} from "../../../../lib/generation-original-cleanup-outbox";
import { hasValidGenerationWorkflowCallbackSecret } from "../../../../lib/generation-workflow-callback-auth";
import { getSupabaseAdminClient } from "../../../../lib/supabase";

const CLEANUP_BATCH_SIZE = 100;

export async function POST(request: Request) {
  if (!(await hasValidGenerationWorkflowCallbackSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();
  try {
    const [generations, drafts] = await Promise.all([
      queueExpiredGenerationOriginals(CLEANUP_BATCH_SIZE, supabase),
      expireGenerationUploadDrafts(CLEANUP_BATCH_SIZE, supabase),
    ]);
    const dispatch = await dispatchGenerationOriginalCleanups({
      limit: CLEANUP_BATCH_SIZE,
      client: supabase,
    });

    return NextResponse.json({ generations, drafts, dispatch });
  } catch (cleanupError) {
    return NextResponse.json(
      {
        error: cleanupError instanceof Error ? cleanupError.message : "Original cleanup sweep failed",
      },
      { status: 500 },
    );
  }
}
