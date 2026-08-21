import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { HairAdjustmentAspect } from "@hairfit/shared/consulting/hair-recommendation";
import { isAiLedHairDecisionEnabled } from "../../../../../../../lib/consulting/feature-flag";
import { requestHairRecommendationAdjustmentV1 } from "../../../../../../../lib/consulting/hair-recommendation-server";
import { v2Failure } from "../../../../../../../lib/v2/http";

interface Params { params: Promise<{ consultationId: string }> }
const ASPECTS = new Set<HairAdjustmentAspect>(["length", "bangs", "volume", "curl-texture", "face-exposure", "maintenance", "change-intensity", "free-text"]);

export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isAiLedHairDecisionEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { expectedRevision?: unknown; idempotencyKey?: unknown; aspects?: unknown };
  const aspects = Array.isArray(body.aspects) ? body.aspects : [];
  if (!Number.isInteger(body.expectedRevision) || typeof body.idempotencyKey !== "string" || !aspects.every((item) => item && typeof item === "object" && ASPECTS.has((item as { aspect: HairAdjustmentAspect }).aspect) && typeof (item as { value?: unknown }).value === "string")) {
    return NextResponse.json({ error: "조정 요청의 revision, idempotencyKey, aspects를 확인해 주세요." }, { status: 400 });
  }
  const { consultationId } = await params;
  try {
    return NextResponse.json(await requestHairRecommendationAdjustmentV1({
      userId,
      request: {
        schemaVersion: "hair-adjustment-request-v1",
        consultationId,
        baseRecommendationRevision: body.expectedRevision as number,
        aspects: aspects as Array<{ aspect: HairAdjustmentAspect; value: string }>,
        idempotencyKey: body.idempotencyKey,
      },
    }));
  } catch (error) {
    return v2Failure(error);
  }
}
