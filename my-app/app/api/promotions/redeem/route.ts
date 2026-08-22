import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { normalizePromotionCode } from "../../../../lib/email-campaign";
import { isHairfitV2Enabled } from "../../../../lib/v2/feature-flags";
import { getSupabaseAdminClient } from "../../../../lib/supabase";

export async function POST(request:Request){
  const {userId}=await auth();
  if(!userId)return NextResponse.json({error:"로그인이 필요합니다."},{status:401});
  if(!isHairfitV2Enabled("LAUNCH_PROMOTION_REDEMPTION_ENABLED"))return NextResponse.json({error:"프로모션 등록이 아직 열리지 않았습니다."},{status:404});
  const idempotencyKey=request.headers.get("Idempotency-Key")?.trim()||"";
  const body=(await request.json().catch(()=>({}))) as {code?:unknown};
  const code=typeof body.code==="string"?normalizePromotionCode(body.code):"";
  if(code.length<8||idempotencyKey.length<8)return NextResponse.json({error:"프로모션 코드와 요청 정보를 확인해 주세요."},{status:400});
  const result=await getSupabaseAdminClient().rpc("redeem_launch_promotion_v2",{p_user_id:userId,p_code:code,p_idempotency_key:idempotencyKey});
  if(result.error){
    const message=result.error.message.toLowerCase();
    if(message.includes("not_eligible"))return NextResponse.json({error:"이 계정에서 사용할 수 없거나 등록 기간이 지난 코드입니다."},{status:403});
    return NextResponse.json({error:"무료 이용권을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요."},{status:409});
  }
  return NextResponse.json({redemption:result.data});
}
