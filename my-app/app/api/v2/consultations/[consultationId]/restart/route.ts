import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../../../lib/supabase";
import { v2Failure } from "../../../../../../lib/v2/http";

export async function POST(_:Request,context:{params:Promise<{consultationId:string}>}) {
  const {userId}=await auth(); if(!userId)return NextResponse.json({error:"로그인이 필요합니다."},{status:401});
  try{
    const {consultationId}=await context.params; const db=getSupabaseAdminClient();
    const session=await db.from("consultation_sessions").select("id,user_restart_count,user_restart_limit,entitlement_grant_id,current_preview_board_id").eq("id",consultationId).eq("user_id",userId).maybeSingle();
    if(session.error)throw new Error(session.error.message);if(!session.data)return NextResponse.json({error:"상담을 찾을 수 없습니다."},{status:404});
    const row=session.data as {user_restart_count:number;user_restart_limit:number;entitlement_grant_id:string|null;current_preview_board_id:string|null};
    if(!row.entitlement_grant_id)return NextResponse.json({error:"유료 풀 스타일 권리가 필요합니다."},{status:402});
    const grant=await db.from("customer_entitlement_grants_v2").select("offering_key").eq("id",row.entitlement_grant_id).eq("user_id",userId).maybeSingle();
    if(grant.error)throw new Error(grant.error.message);if(!(grant.data as {offering_key?:string}|null)?.offering_key?.startsWith("full_style_"))return NextResponse.json({error:"유료 풀 스타일 권리가 필요합니다."},{status:402});
    if(row.user_restart_count>=row.user_restart_limit)return NextResponse.json({error:"이 상담의 사용자 재시작 1회를 이미 사용했습니다."},{status:409});
    const recorded=await db.from("consultation_restarts_v2").insert({consultation_id:consultationId,user_id:userId,reason:"user_requested",counts_toward_limit:true,source_preview_board_id:row.current_preview_board_id}).select("id").single();
    if(recorded.error)throw new Error(recorded.error.message);
    const updated=await db.from("consultation_sessions").update({user_restart_count:row.user_restart_count+1,current_preview_board_id:null,selected_snapshot_id:null,lifecycle_state:"analysis_ready",updated_at:new Date().toISOString()}).eq("id",consultationId).eq("user_id",userId);
    if(updated.error)throw new Error(updated.error.message);
    return NextResponse.json({ok:true,restartCount:row.user_restart_count+1,restartLimit:row.user_restart_limit});
  }catch(error){return v2Failure(error);}
}
