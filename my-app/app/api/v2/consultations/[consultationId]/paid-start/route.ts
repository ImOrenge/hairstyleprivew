import { auth } from "@clerk/nextjs/server";
import { FULL_STYLE_REFUND_POLICY_VERSION, FULL_STYLE_SERVICE_START_TRIGGERS, type FullStyleServiceStartTrigger } from "@hairfit/shared/v2";
import { NextResponse } from "next/server";
import { isHairfitV2Enabled } from "../../../../../../lib/v2/feature-flags";
import { activatePaidConsultationV2, getPaidStartStateV2 } from "../../../../../../lib/v2/paid-start-server";
import { v2Failure } from "../../../../../../lib/v2/http";

type Context={params:Promise<{consultationId:string}>};
function disabled(){return !isHairfitV2Enabled("FULL_STYLE_REFUND_POLICY_V2_ENABLED");}

export async function GET(_:Request,{params}:Context){
  const {userId}=await auth();if(!userId)return NextResponse.json({error:"로그인이 필요합니다."},{status:401});
  if(disabled())return NextResponse.json({error:"유료 상담 시작 정책이 비활성화되어 있습니다."},{status:404});
  try{const {consultationId}=await params;return NextResponse.json({paidStart:await getPaidStartStateV2(userId,consultationId)});}catch(error){return v2Failure(error);}
}

export async function POST(request:Request,{params}:Context){
  const {userId}=await auth();if(!userId)return NextResponse.json({error:"로그인이 필요합니다."},{status:401});
  if(disabled())return NextResponse.json({error:"유료 상담 시작 정책이 비활성화되어 있습니다."},{status:404});
  const body=await request.json().catch(()=>({})) as {startTrigger?:unknown;policyVersion?:unknown;consentedAt?:unknown};
  if(typeof body.startTrigger!=="string"||!(FULL_STYLE_SERVICE_START_TRIGGERS as readonly string[]).includes(body.startTrigger)||typeof body.policyVersion!=="string"||typeof body.consentedAt!=="string")return NextResponse.json({error:"유료 상담 시작 동의를 확인해 주세요."},{status:400});
  try{const {consultationId}=await params;const activation=await activatePaidConsultationV2({userId,consultationId,startTrigger:body.startTrigger as FullStyleServiceStartTrigger,policyVersion:body.policyVersion||FULL_STYLE_REFUND_POLICY_VERSION,consentedAt:body.consentedAt});return NextResponse.json({activation},{status:201});}catch(error){return v2Failure(error);}
}
