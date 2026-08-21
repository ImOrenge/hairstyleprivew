import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isFullStyleAftercareCheckinsEnabled } from "../../../../../../../../lib/consulting/feature-flag";
import { submitAftercareCheckinV2 } from "../../../../../../../../lib/v2/aftercare-checkin-server";
import { v2Failure } from "../../../../../../../../lib/v2/http";

export async function POST(request:Request,{params}:{params:Promise<{consultationId:string;slot:string}>}){
  const {userId}=await auth();if(!userId)return NextResponse.json({error:"로그인이 필요합니다."},{status:401});
  if(!isFullStyleAftercareCheckinsEnabled())return NextResponse.json({error:"사후상담 기능이 비활성화되어 있습니다."},{status:404});
  const idempotencyKey=request.headers.get("idempotency-key")?.trim();if(!idempotencyKey||idempotencyKey.length<8||idempotencyKey.length>160)return NextResponse.json({error:"요청 식별값을 확인해 주세요."},{status:400});
  try{const {consultationId,slot:rawSlot}=await params;const slot=Number(rawSlot);if(!Number.isInteger(slot)||slot<1||slot>3)return NextResponse.json({error:"사후상담 일정을 확인해 주세요."},{status:400});return NextResponse.json({checkin:await submitAftercareCheckinV2({userId,consultationId,slot,idempotencyKey})});}catch(error){return v2Failure(error);}
}
