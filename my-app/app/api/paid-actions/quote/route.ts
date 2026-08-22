import { auth } from "@clerk/nextjs/server";
import {
  isPaidAction,
  isPaidActionBillingScope,
  type PaidActionQuoteRequest,
} from "@hairfit/shared";
import { NextResponse } from "next/server";
import {
  createPaidActionQuoteForUser,
  PaidActionQuoteContextError,
} from "../../../../lib/paid-action-quote";
import { getApiContext } from "../../../../lib/rbac-server";
import { getSupabaseAdminClient } from "../../../../lib/supabase";
import { quoteFullStyleConsultationAccessV2 } from "../../../../lib/v2/entitlement-server";
import { isHairfitV2Enabled } from "../../../../lib/v2/feature-flags";

const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Partial<PaidActionQuoteRequest> & { consultationId?:unknown };
  if (!isPaidAction(body.action)) {
    return NextResponse.json({ error: "지원하지 않는 유료 작업입니다." }, { status: 400 });
  }
  if (!isPaidActionBillingScope(body.billingScope)) {
    return NextResponse.json({ error: "결제 주체를 확인해 주세요." }, { status: 400 });
  }
  if (typeof body.subjectId !== "string" || !body.subjectId.trim()) {
    return NextResponse.json({ error: "견적 대상 정보가 필요합니다." }, { status: 400 });
  }

  try {
    const salonContext = body.billingScope === "salon"
      ? await getApiContext("salon:write")
      : null;
    if (salonContext && !salonContext.ok) {
      return salonContext.response;
    }
    const supabase=salonContext?.ok ? salonContext.supabase : getSupabaseAdminClient();
    const consultationId=typeof body.consultationId==="string"&&UUID_PATTERN.test(body.consultationId)?body.consultationId:null;
    let hairGenerationEntitled=false;
    if(body.action==="hair_generation"&&body.billingScope==="customer"&&consultationId&&(isHairfitV2Enabled("FREE_HAIR_DEMO_ENABLED")||isHairfitV2Enabled("FULL_STYLE_CATALOG_ENABLED"))) {
      const owner=await supabase.from("consultation_sessions").select("id").eq("id",consultationId).eq("user_id",userId).maybeSingle();
      if(owner.error) throw new PaidActionQuoteContextError(owner.error.message,500);
      if(owner.data) hairGenerationEntitled=(await quoteFullStyleConsultationAccessV2(userId,consultationId)).allowed;
    }
    const quote = await createPaidActionQuoteForUser({
      supabase,
      userId,
      action: body.action,
      subjectId: body.subjectId,
      billingScope: body.billingScope,
      hairGenerationEntitled,
    });
    return NextResponse.json(
      { quote },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    if (error instanceof PaidActionQuoteContextError) {
      if (error.status >= 500) {
        console.error("[paid-action-quote] Failed to load quote context", {
          userId,
          action: body.action,
          message: error.message,
        });
      }
      return NextResponse.json(
        {
          error: error.status >= 500
            ? "최신 크레딧 견적을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
            : error.message,
        },
        { status: error.status },
      );
    }
    const message = error instanceof Error ? error.message : "견적을 만들지 못했습니다.";
    console.error("[paid-action-quote] Failed to issue quote", { userId, action: body.action, message });
    return NextResponse.json({ error: "최신 크레딧 견적을 불러오지 못했습니다." }, { status: 500 });
  }
}
