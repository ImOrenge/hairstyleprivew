import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isHairfitV2Enabled } from "../../../../lib/v2/feature-flags";
import { getSupabaseAdminClient } from "../../../../lib/supabase";

export async function GET() {
  const {userId}=await auth();
  if(!userId)return NextResponse.json({error:"로그인이 필요합니다."},{status:401});
  if(!isHairfitV2Enabled("LAUNCH_PROMOTION_REDEMPTION_ENABLED"))return NextResponse.json({enabled:false,eligible:false});
  const now=new Date().toISOString();
  const db=getSupabaseAdminClient();
  const campaigns=await db.from("email_campaigns_v2")
    .select("id,name,promotion_code,claim_starts_at,claim_ends_at,grant_valid_days,capability_snapshot,status")
    .eq("campaign_type","promotion").in("status",["audience_ready","scheduled","sending","paused","completed"])
    .lte("claim_starts_at",now).gte("claim_ends_at",now).order("claim_starts_at",{ascending:false}).limit(1);
  if(campaigns.error)return NextResponse.json({error:"프로모션을 확인하지 못했습니다."},{status:500});
  const campaign=campaigns.data?.[0] as {id:string;name:string;promotion_code:string;claim_starts_at:string;claim_ends_at:string;grant_valid_days:number;capability_snapshot:unknown;status:string}|undefined;
  if(!campaign)return NextResponse.json({enabled:true,eligible:false});
  const [recipient,redemption]=await Promise.all([
    db.from("email_campaign_recipients_v2").select("id").eq("campaign_id",campaign.id).eq("user_id",userId).maybeSingle(),
    db.from("promotion_redemptions_v2").select("id,grant_id,redeemed_at").eq("campaign_id",campaign.id).eq("user_id",userId).maybeSingle(),
  ]);
  if(recipient.error||redemption.error)return NextResponse.json({error:"프로모션 자격을 확인하지 못했습니다."},{status:500});
  return NextResponse.json({
    enabled:true,eligible:Boolean(recipient.data),redeemed:Boolean(redemption.data),redemption:redemption.data||null,
    campaign:{id:campaign.id,name:campaign.name,code:campaign.promotion_code,claimStartsAt:campaign.claim_starts_at,claimEndsAt:campaign.claim_ends_at,grantValidDays:campaign.grant_valid_days,capabilities:campaign.capability_snapshot},
  });
}
