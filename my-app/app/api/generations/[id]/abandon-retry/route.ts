import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  abandonGenerationRetry,
  dispatchGenerationOriginalCleanups,
} from "../../../../../lib/generation-original-cleanup-outbox";
import { getSupabaseAdminClient } from "../../../../../lib/supabase";

const uuidV4LikeRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const generationId = id?.trim() || "";
  if (!uuidV4LikeRegex.test(generationId)) {
    return NextResponse.json({ error: "generationId must be a valid UUID" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  try {
    const cleanup = await abandonGenerationRetry(generationId, userId, supabase);
    const dispatch = cleanup.cleanupId
      ? await dispatchGenerationOriginalCleanups({ cleanupId: cleanup.cleanupId, limit: 1, client: supabase })
      : null;
    const cleanupStatus = cleanup.cleanupStatus === "deleted" || dispatch?.deleted
      ? "deleted"
      : "cleanup_queued";
    return NextResponse.json({
      ok: true,
      cleanup,
      originalRetention: {
        status: cleanupStatus,
        retryAvailable: false,
        expiresAt: cleanup.retentionExpiresAt,
        retryAbandonedAt: cleanup.retryAbandonedAt,
        cleanupReason: "retry_abandoned",
        deletedAt: cleanupStatus === "deleted" ? new Date().toISOString() : null,
      },
      dispatch,
    }, { status: dispatch?.deferred ? 202 : 200 });
  } catch (cleanupError) {
    const message = cleanupError instanceof Error ? cleanupError.message : "Retry abandonment failed";
    if (/not found for this user/i.test(message)) {
      return NextResponse.json({ error: "Generation not found" }, { status: 404 });
    }
    if (/not terminal|active variant attempt|no failed result/i.test(message)) {
      return NextResponse.json(
        { error: "진행 중인 작업이 있거나 포기할 무료 재시도가 없습니다." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
