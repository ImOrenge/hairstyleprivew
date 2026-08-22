import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isHairfitV2Enabled } from "../../../../../lib/v2/feature-flags";
import { getSupabaseAdminClient } from "../../../../../lib/supabase";

type ContractAction = "cancel_at_period_end" | "resume";

function isContractAction(value: unknown): value is ContractAction {
  return value === "cancel_at_period_end" || value === "resume";
}

export async function PUT(request: Request, context: { params: Promise<{ contractId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isHairfitV2Enabled("FULL_STYLE_CATALOG_ENABLED")) {
    return NextResponse.json({ error: "계약 관리를 준비 중입니다." }, { status: 404 });
  }

  const { contractId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(contractId)) {
    return NextResponse.json({ error: "계약 번호가 올바르지 않습니다." }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  if (!isContractAction(body.action)) {
    return NextResponse.json({ error: "요청한 계약 변경을 확인해 주세요." }, { status: 400 });
  }

  const db = getSupabaseAdminClient();
  const current = await db.from("full_style_contracts_v2")
    .select("id,billing_interval,status,cancel_at_period_end")
    .eq("id", contractId).eq("user_id", userId).maybeSingle();
  if (current.error) return NextResponse.json({ error: current.error.message }, { status: 500 });
  if (!current.data) return NextResponse.json({ error: "계약을 찾을 수 없습니다." }, { status: 404 });

  const contract = current.data as { billing_interval: string | null; status: string; cancel_at_period_end: boolean };
  if (!contract.billing_interval) {
    return NextResponse.json({ error: "1회 상품은 자동 갱신되지 않습니다." }, { status: 409 });
  }
  if (!['active','cancel_at_period_end'].includes(contract.status)) {
    return NextResponse.json({ error: "현재 상태에서는 갱신 설정을 바꿀 수 없습니다." }, { status: 409 });
  }

  const cancel = body.action === "cancel_at_period_end";
  const update = await db.from("full_style_contracts_v2").update({
    status: cancel ? "cancel_at_period_end" : "active",
    cancel_at_period_end: cancel,
    updated_at: new Date().toISOString(),
  }).eq("id", contractId).eq("user_id", userId)
    .select("id,status,cancel_at_period_end,period_ends_at,next_billing_at").single();
  if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
  return NextResponse.json({ contract: update.data });
}
