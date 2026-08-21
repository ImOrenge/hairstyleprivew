import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isFashionRequestedCountV2 } from "@hairfit/shared";
import { expandFashionBatch } from "../../../../../../../lib/consulting/fashion-batch-server";
import { isFashionAdaptiveBatchEnabled, isFashionBatchEnabled } from "../../../../../../../lib/consulting/feature-flag";
import { v2Disabled, v2Failure } from "../../../../../../../lib/v2/http";

interface Params { params: Promise<{ consultationId: string }> }

export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isFashionBatchEnabled() || !isFashionAdaptiveBatchEnabled()) return NextResponse.json({ error: "Adaptive Fashion batch is disabled." }, { status: 404 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED", "STYLING_LINK_V2_ENABLED"); if (disabled) return disabled;
  const { consultationId } = await params;
  const body = await request.json().catch(() => ({})) as { batchId?: unknown; expectedRequestedCount?: unknown; targetRequestedCount?: unknown };
  if (typeof body.batchId !== "string" || typeof body.expectedRequestedCount !== "number" || typeof body.targetRequestedCount !== "number" || !isFashionRequestedCountV2(body.expectedRequestedCount) || !isFashionRequestedCountV2(body.targetRequestedCount)) {
    return NextResponse.json({ error: "batchId와 현재·목표 생성 수량을 확인해 주세요." }, { status: 400 });
  }
  try {
    return NextResponse.json(await expandFashionBatch({
      userId, consultationId, batchId: body.batchId,
      expectedRequestedCount: body.expectedRequestedCount,
      targetRequestedCount: body.targetRequestedCount,
      idempotencyKey: request.headers.get("Idempotency-Key")?.trim() || "",
      localBaseUrl: new URL(request.url).origin,
    }), { status: 202 });
  } catch (error) { return v2Failure(error); }
}
