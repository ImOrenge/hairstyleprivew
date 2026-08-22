import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { MARKETING_CONSENT_POLICY_VERSION } from "../../../../lib/email-campaign";
import { getSupabaseAdminClient } from "../../../../lib/supabase";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error:"로그인이 필요합니다." }, { status:401 });
  const db=getSupabaseAdminClient();
  const clerkUser=await currentUser();
  const metadata=clerkUser?.unsafeMetadata as Record<string,unknown>|undefined;
  if(metadata?.marketingEmailConsent===true&&metadata.marketingEmailConsentPolicy===MARKETING_CONSENT_POLICY_VERSION){
    const captured=await db.rpc("capture_signup_marketing_consent_v2",{p_user_id:userId,p_policy_version:MARKETING_CONSENT_POLICY_VERSION});
    if(captured.error)return NextResponse.json({ error:"가입 시 수신 동의를 확인하지 못했습니다." },{status:500});
  }
  const result = await db.from("marketing_email_preferences_v2")
    .select("status,policy_version,consented_at,withdrawn_at,suppressed_at")
    .eq("user_id",userId).maybeSingle();
  if (result.error) return NextResponse.json({ error:"수신 설정을 불러오지 못했습니다." }, { status:500 });
  return NextResponse.json({ preference:result.data || { status:"unknown",policy_version:MARKETING_CONSENT_POLICY_VERSION } });
}

export async function PUT(request:Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error:"로그인이 필요합니다." }, { status:401 });
  const body=(await request.json().catch(()=>({}))) as { optedIn?:unknown;policyVersion?:unknown };
  if(typeof body.optedIn!=="boolean"||body.policyVersion!==MARKETING_CONSENT_POLICY_VERSION){
    return NextResponse.json({ error:"최신 마케팅 수신 동의 내용을 확인해 주세요." }, { status:400 });
  }
  const now=new Date().toISOString();
  const result=await getSupabaseAdminClient().from("marketing_email_preferences_v2").upsert({
    user_id:userId,status:body.optedIn?"opted_in":"opted_out",policy_version:MARKETING_CONSENT_POLICY_VERSION,
    source:"mypage",consented_at:body.optedIn?now:null,withdrawn_at:body.optedIn?null:now,updated_at:now,
  },{onConflict:"user_id"}).select("status,policy_version,consented_at,withdrawn_at,suppressed_at").single();
  if(result.error)return NextResponse.json({ error:"수신 설정을 저장하지 못했습니다." },{status:500});
  return NextResponse.json({preference:result.data});
}
