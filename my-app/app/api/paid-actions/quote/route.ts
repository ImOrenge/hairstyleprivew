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

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Partial<PaidActionQuoteRequest>;
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
    const quote = await createPaidActionQuoteForUser({
      supabase: salonContext?.ok ? salonContext.supabase : getSupabaseAdminClient(),
      userId,
      action: body.action,
      subjectId: body.subjectId,
      billingScope: body.billingScope,
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
