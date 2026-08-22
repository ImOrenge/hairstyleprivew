import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getShortlistV2, saveShortlistV2 } from "../../../../../../lib/v2/selection-server";
import { v2Disabled, v2Failure } from "../../../../../../lib/v2/http";
import { isHairfitV2Enabled } from "../../../../../../lib/v2/feature-flags";
import { quoteFullStyleConsultationAccessV2 } from "../../../../../../lib/v2/entitlement-server";
import { getPaidStartStateV2 } from "../../../../../../lib/v2/paid-start-server";

interface Params { params: Promise<{ consultationId: string }> }
export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED", "PREVIEW_BOARD_STRATEGY_V2_ENABLED"); if (disabled) return disabled;
  const { consultationId } = await params;
  try {
    const shortlist = await getShortlistV2(userId, consultationId);
    return shortlist
      ? NextResponse.json({ shortlist })
      : NextResponse.json({ error: "shortlist가 없습니다." }, { status: 404 });
  } catch (error) { return v2Failure(error); }
}

export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED", "PREVIEW_BOARD_STRATEGY_V2_ENABLED"); if (disabled) return disabled;
  const { consultationId } = await params;
  const body = (await request.json().catch(() => ({}))) as { previewVariantIds?: unknown; expectedVersion?: unknown };
  if (!Array.isArray(body.previewVariantIds) || !body.previewVariantIds.every((item) => typeof item === "string") || !Number.isInteger(body.expectedVersion)) {
    return NextResponse.json({ error: "previewVariantIds와 expectedVersion을 확인해 주세요." }, { status: 400 });
  }
  try {
    if (isHairfitV2Enabled("FULL_STYLE_REFUND_POLICY_V2_ENABLED")) {
      const access = await quoteFullStyleConsultationAccessV2(userId, consultationId);
      if (access.access !== "paid") {
        return NextResponse.json({ error: "후보 비교에는 유료 풀 스타일 권리가 필요합니다." }, { status: 402 });
      }
      const paidStart = await getPaidStartStateV2(userId, consultationId);
      if (!paidStart.activated) {
        return NextResponse.json({ error: "유료 상담 시작 안내를 확인하고 별도로 동의해 주세요.", code: "PAID_START_CONSENT_REQUIRED" }, { status: 428 });
      }
    }
    return NextResponse.json({ shortlist: await saveShortlistV2({
      userId, consultationId, previewVariantIds: body.previewVariantIds as string[], expectedVersion: body.expectedVersion as number,
    }) });
  } catch (error) { return v2Failure(error); }
}
