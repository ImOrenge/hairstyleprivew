import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../../../lib/supabase";
import { v2Failure } from "../../../../../../lib/v2/http";

export async function POST(_:Request,context:{params:Promise<{consultationId:string}>}) {
  const {userId}=await auth(); if(!userId)return NextResponse.json({error:"로그인이 필요합니다."},{status:401});
  try{
    const {consultationId}=await context.params; const db=getSupabaseAdminClient();
    const claimed=await db.rpc("claim_consultation_restart_v2",{p_user_id:userId,p_consultation_id:consultationId});
    if(claimed.error){
      if(claimed.error.message.includes("CONSULTATION_NOT_FOUND"))return NextResponse.json({error:"상담을 찾을 수 없습니다."},{status:404});
      if(claimed.error.message.includes("PAID_FULL_STYLE_REQUIRED"))return NextResponse.json({error:"유료 풀 스타일 권리가 필요합니다."},{status:402});
      if(claimed.error.message.includes("RESTART_ONLY_BEFORE_FINAL"))return NextResponse.json({error:"전체 재시작은 최종 헤어를 확정하기 전에만 사용할 수 있습니다."},{status:409});
      if(claimed.error.message.includes("RESTART_LIMIT_EXCEEDED"))return NextResponse.json({error:"이 상담에서 제공되는 전체 재시작 횟수를 모두 사용했습니다."},{status:409});
      throw new Error(claimed.error.message);
    }
    const result=Array.isArray(claimed.data)?claimed.data[0]:claimed.data;
    return NextResponse.json({ok:true,...result});
  }catch(error){return v2Failure(error);}
}
