import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { dispatchFashionBatch, prepareFashionBatch, readFashionBatch, reconcileFashionBatch } from "../../../../../../lib/consulting/fashion-batch-server";
import { normalizeFashionBatchDirection, prepareFashionRecommendationSessions } from "../../../../../../lib/consulting/fashion-recommendation-batch-server";
import { isFashionAdaptiveBatchEnabled, isFashionBatchEnabled } from "../../../../../../lib/consulting/feature-flag";
import { v2Disabled, v2Failure } from "../../../../../../lib/v2/http";

interface Params { params: Promise<{ consultationId: string }> }

function disabled() {
  return !isFashionBatchEnabled()
    ? NextResponse.json({ error: "Fashion batch V2 is disabled." }, { status: 404 })
    : v2Disabled("CONSULTATION_SESSION_V2_ENABLED", "STYLING_LINK_V2_ENABLED");
}

export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const gate = disabled(); if (gate) return gate;
  const { consultationId } = await params;
  try { return NextResponse.json({ ...(await readFashionBatch(userId, consultationId)), adaptiveEnabled: isFashionAdaptiveBatchEnabled() }); }
  catch (error) { return v2Failure(error); }
}

export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const gate = disabled(); if (gate) return gate;
  const { consultationId } = await params;
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || "";
  const body = (await request.json().catch(() => ({}))) as { direction?: unknown };
  if (typeof body.direction !== "object" || !body.direction) {
    return NextResponse.json({ error: "패션 방향을 확인해 주세요." }, { status: 400 });
  }
  try {
    const direction = normalizeFashionBatchDirection(body.direction);
    const adaptive = isFashionAdaptiveBatchEnabled();
    const requestedCount = adaptive ? 3 : 9;
    const prepared = await prepareFashionRecommendationSessions({ userId, consultationId, direction, requestedCount, adaptive });
    return NextResponse.json(await prepareFashionBatch({
      userId, consultationId, idempotencyKey,
      stylingSessionIds: prepared.stylingSessionIds,
      generationInputFingerprint: prepared.generationInputFingerprint,
      colorSelectionSnapshotId: prepared.colorSelectionSnapshotId,
      personalColorProfileId: prepared.personalColorProfileId,
      requestedCount,
      direction,
      localBaseUrl: new URL(request.url).origin,
    }), { status: 201 });
  } catch (error) { return v2Failure(error); }
}

export async function PATCH(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const gate = disabled(); if (gate) return gate;
  const { consultationId } = await params;
  const body = (await request.json().catch(() => ({}))) as { action?: unknown; batchId?: unknown };
  if (typeof body.batchId !== "string") return NextResponse.json({ error: "batchId가 필요합니다." }, { status: 400 });
  try {
    if (body.action === "reconcile") return NextResponse.json(await reconcileFashionBatch(userId, consultationId, body.batchId, new URL(request.url).origin));
    if (body.action === "dispatch") return NextResponse.json(await dispatchFashionBatch(userId, consultationId, body.batchId, new URL(request.url).origin), { status: 202 });
    return NextResponse.json({ error: "지원하지 않는 배치 작업입니다." }, { status: 400 });
  } catch (error) { return v2Failure(error); }
}
