import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isFullStyleAftercareCheckinsEnabled } from "../../../../../../lib/consulting/feature-flag";
import { listAftercareCheckinsV2 } from "../../../../../../lib/v2/aftercare-checkin-server";
import { v2Failure } from "../../../../../../lib/v2/http";

export async function GET(_:Request,{params}:{params:Promise<{consultationId:string}>}){
  const {userId}=await auth();if(!userId)return NextResponse.json({error:"로그인이 필요합니다."},{status:401});
  if(!isFullStyleAftercareCheckinsEnabled())return NextResponse.json({error:"사후상담 기능이 비활성화되어 있습니다."},{status:404});
  try{const {consultationId}=await params;return NextResponse.json(await listAftercareCheckinsV2(userId,consultationId));}catch(error){return v2Failure(error);}
}
