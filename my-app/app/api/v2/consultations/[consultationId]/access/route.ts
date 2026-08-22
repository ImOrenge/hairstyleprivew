import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getConsultationV2 } from "../../../../../../lib/v2/consultation-server";
import { quoteFullStyleConsultationAccessV2 } from "../../../../../../lib/v2/entitlement-server";
import { v2Failure } from "../../../../../../lib/v2/http";
import { getSupabaseAdminClient } from "../../../../../../lib/supabase";
import { isHairfitV2Enabled } from "../../../../../../lib/v2/feature-flags";
import { getPaidStartStateV2 } from "../../../../../../lib/v2/paid-start-server";

export async function GET(_: Request, context: { params: Promise<{ consultationId:string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error:"로그인이 필요합니다." }, { status:401 });
  try {
    const { consultationId } = await context.params;
    const consultation = await getConsultationV2(userId, consultationId);
    if (!consultation) return NextResponse.json({ error:"상담을 찾을 수 없습니다." }, { status:404 });
    const decision = await quoteFullStyleConsultationAccessV2(userId,consultationId);
    const restart=await getSupabaseAdminClient().from("consultation_sessions")
      .select("user_restart_count,user_restart_limit,lifecycle_state")
      .eq("id",consultationId).eq("user_id",userId).single();
    if(restart.error)throw new Error(restart.error.message);
    const restartRow=restart.data as {user_restart_count:number;user_restart_limit:number;lifecycle_state:string};
    const paidStart=isHairfitV2Enabled("FULL_STYLE_REFUND_POLICY_V2_ENABLED")
      ? await getPaidStartStateV2(userId,consultationId)
      : null;
    return NextResponse.json({
      access:decision.access,
      offeringKey:decision.offeringKey,
      canGenerate:decision.allowed,
      canCompare:decision.access === "paid",
      remainingSessions:decision.remainingSessions,
      capabilities:decision.capabilities,
      paidStart,
      restart:{
        used:restartRow.user_restart_count,
        limit:restartRow.user_restart_limit,
        remaining:Math.max(0,restartRow.user_restart_limit-restartRow.user_restart_count),
        availableBeforeFinal:!["selection_confirmed","salon_brief_ready","color_ready","makeup_ready","fashion_ready","aftercare_ready","complete"].includes(restartRow.lifecycle_state),
      },
    });
  } catch (error) { return v2Failure(error); }
}
