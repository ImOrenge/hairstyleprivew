import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../lib/admin-auth";
import { LAUNCH_PROMOTION_CODE, marketingUnsubscribeHeaders, renderEmailCampaign, type EmailCampaignTemplateVersion } from "../../../../lib/email-campaign";
import { sendEmail } from "../../../../lib/resend";
import { getSiteUrl } from "../../../../lib/site-url";

const DELIVERY_MODES=new Set(["off","test","live"]);
const CAMPAIGN_TYPES=new Set(["service_notice","promotion"]);
type CampaignListRow={id:string;[key:string]:unknown};
type RecipientSummaryRow={campaign_id:string;status:string;delivery_eligible:boolean;recipient_count:number|string};
type OfferingRow={id:string;offering_key:string;version:number;capabilities:unknown};
type RenderRecipientRow={id:string;recipient_email:string;unsubscribe_token:string};

function enabled(){return process.env.MARKETING_EMAIL_CAMPAIGNS_ENABLED==="true";}
function deliveryMode(){const value=(process.env.MARKETING_EMAIL_DELIVERY_MODE||"off").trim().toLowerCase();return DELIVERY_MODES.has(value)?value:"off";}
function siteUrl(){const value=getSiteUrl();return /^https?:\/\//i.test(value)?value:"https://hairfit.beauty";}
function templateFor(type:string):EmailCampaignTemplateVersion{return type==="promotion"?"official-launch-promotion-v1":"service-premium-update-v1";}

export async function GET(){
  const context=await getAdminApiContext();if(!context.ok)return context.response;
  const campaigns=await context.supabase.from("email_campaigns_v2").select("id,campaign_key,campaign_type,template_version,name,subject,preheader,promotion_code,eligibility_cutoff,claim_starts_at,claim_ends_at,grant_valid_days,scheduled_at,frozen_at,test_sent_at,status,created_at,updated_at").order("created_at",{ascending:false}).limit(50);
  if(campaigns.error)return NextResponse.json({error:campaigns.error.message},{status:500});
  const campaignRows=(campaigns.data||[]) as unknown as CampaignListRow[];
  const ids=campaignRows.map(row=>row.id);
  const recipients=ids.length?await context.supabase.rpc("get_email_campaign_recipient_counts_v2",{p_campaign_ids:ids}):{data:[],error:null};
  if(recipients.error)return NextResponse.json({error:recipients.error.message},{status:500});
  const recipientRows=(recipients.data||[]) as unknown as RecipientSummaryRow[];
  const counts=recipientRows.reduce<Record<string,Record<string,number>>>((all,row)=>{const group=all[row.campaign_id]||={total:0,emailEligible:0,inAppOnly:0};const count=Number(row.recipient_count)||0;group.total+=count;if(row.delivery_eligible)group.emailEligible+=count;else group.inAppOnly+=count;group[row.status]=(group[row.status]||0)+count;return all;},{});
  return NextResponse.json({enabled:enabled(),deliveryMode:deliveryMode(),campaigns:campaignRows.map(row=>({...row,counts:counts[row.id]||{total:0,emailEligible:0,inAppOnly:0}}))});
}

export async function POST(request:Request){
  const context=await getAdminApiContext();if(!context.ok)return context.response;
  if(!enabled())return NextResponse.json({error:"캠페인 기능 플래그가 꺼져 있습니다."},{status:404});
  const body=(await request.json().catch(()=>({}))) as Record<string,unknown>;
  const action=String(body.action||"");
  const base=siteUrl();
  if(action==="preview"){
    const type=String(body.campaignType||"promotion");if(!CAMPAIGN_TYPES.has(type))return NextResponse.json({error:"템플릿을 확인해 주세요."},{status:400});
    return NextResponse.json({preview:renderEmailCampaign({templateVersion:templateFor(type),claimEndsAt:typeof body.claimEndsAt==="string"?body.claimEndsAt:null,promotionCode:typeof body.promotionCode==="string"?body.promotionCode:LAUNCH_PROMOTION_CODE,subjectOverride:typeof body.subject==="string"?body.subject.slice(0,180):null,preheaderOverride:typeof body.preheader==="string"?body.preheader.slice(0,240):null,redeemUrl:type==="promotion"?`${base}/promotions/redeem`:`${base}/mypage?tab=plan`,unsubscribeUrl:type==="promotion"?`${base}/email/unsubscribe?token=preview`:null})});
  }
  if(action==="create"){
    const type=String(body.campaignType||"");if(!CAMPAIGN_TYPES.has(type))return NextResponse.json({error:"캠페인 종류를 확인해 주세요."},{status:400});
    const cutoff=new Date(String(body.eligibilityCutoff||""));if(Number.isNaN(cutoff.getTime()))return NextResponse.json({error:"가입 기준 시각을 확인해 주세요."},{status:400});
    const starts=type==="promotion"?new Date(String(body.claimStartsAt||"")):null;const ends=type==="promotion"?new Date(String(body.claimEndsAt||"")):null;
    if(type==="promotion"&&(!starts||!ends||Number.isNaN(starts.getTime())||Number.isNaN(ends.getTime())||ends<=starts))return NextResponse.json({error:"코드 등록 기간을 확인해 주세요."},{status:400});
    if(type==="promotion"&&starts&&cutoff>=starts)return NextResponse.json({error:"기존 회원 가입 기준은 코드 등록 시작보다 이전이어야 합니다."},{status:400});
    const templateVersion=templateFor(type);const promotionCode=type==="promotion"?String(body.promotionCode||LAUNCH_PROMOTION_CODE).trim().toUpperCase():null;
    let offering:OfferingRow|null=null;
    if(type==="promotion"){
      const result=await context.supabase.from("product_offerings_v2").select("id,offering_key,version,capabilities").eq("offering_key","full_style_once").eq("status","active").order("version",{ascending:false}).limit(1).maybeSingle();
      if(result.error||!result.data)return NextResponse.json({error:result.error?.message||"활성 풀스타일 1회 상품을 찾을 수 없습니다."},{status:409});offering=result.data as unknown as OfferingRow;
    }
    const rendered=renderEmailCampaign({templateVersion,claimEndsAt:ends?.toISOString(),promotionCode,subjectOverride:typeof body.subject==="string"?body.subject.slice(0,180):null,preheaderOverride:typeof body.preheader==="string"?body.preheader.slice(0,240):null,redeemUrl:type==="promotion"?`${base}/promotions/redeem`:`${base}/mypage?tab=plan`});
    const campaignKey=`${type}-${Date.now()}`;
    const inserted=await context.supabase.from("email_campaigns_v2").insert({campaign_key:campaignKey,campaign_type:type,template_version:templateVersion,name:String(body.name||rendered.subject).slice(0,120),subject:rendered.subject,preheader:rendered.preheader,promotion_code:promotionCode,offering_id:offering?.id||null,offering_key:offering?.offering_key||null,offering_version:offering?.version||null,capability_snapshot:offering?.capabilities||null,eligibility_cutoff:cutoff.toISOString(),claim_starts_at:starts?.toISOString()||null,claim_ends_at:ends?.toISOString()||null,grant_valid_days:30,created_by:context.userId}).select("id,status").single();
    if(inserted.error)return NextResponse.json({error:inserted.error.message},{status:409});return NextResponse.json({campaign:inserted.data},{status:201});
  }
  const campaignId=typeof body.campaignId==="string"?body.campaignId:"";if(!campaignId)return NextResponse.json({error:"캠페인을 선택해 주세요."},{status:400});
  const campaignResult=await context.supabase.from("email_campaigns_v2").select("id,campaign_type,template_version,promotion_code,claim_ends_at,subject,preheader,status").eq("id",campaignId).single();
  if(campaignResult.error)return NextResponse.json({error:"캠페인을 찾을 수 없습니다."},{status:404});
  const campaign=campaignResult.data as {id:string;campaign_type:string;template_version:EmailCampaignTemplateVersion;promotion_code:string|null;claim_ends_at:string|null;subject:string;preheader:string;status:string};
  if(action==="audience"){
    const frozen=await context.supabase.rpc("freeze_email_campaign_audience_v2",{p_campaign_id:campaignId,p_actor:context.userId});if(frozen.error)return NextResponse.json({error:frozen.error.message},{status:409});
    const pageSize=500;
    for(let offset=0;;offset+=pageSize){
      const recipients=await context.supabase.from("email_campaign_recipients_v2").select("id,recipient_email,unsubscribe_token").eq("campaign_id",campaignId).eq("delivery_eligible",true).order("id",{ascending:true}).range(offset,offset+pageSize-1);
      if(recipients.error)return NextResponse.json({error:recipients.error.message},{status:500});
      const recipientRows=(recipients.data||[]) as unknown as RenderRecipientRow[];
      const updates=recipientRows.map(row=>{const unsubscribeUrl=campaign.campaign_type==="promotion"?`${base}/email/unsubscribe?token=${row.unsubscribe_token}`:null;const rendered=renderEmailCampaign({templateVersion:campaign.template_version,claimEndsAt:campaign.claim_ends_at,promotionCode:campaign.promotion_code,subjectOverride:campaign.subject,preheaderOverride:campaign.preheader,redeemUrl:campaign.campaign_type==="promotion"?`${base}/promotions/redeem`:`${base}/mypage?tab=plan`,unsubscribeUrl});return context.supabase.from("email_campaign_recipients_v2").update({subject:rendered.subject,html_body:rendered.html,text_body:rendered.text,updated_at:new Date().toISOString()}).eq("id",row.id);});
      for(let batch=0;batch<updates.length;batch+=25){const settled=await Promise.all(updates.slice(batch,batch+25));const failed=settled.find(result=>result.error);if(failed?.error)return NextResponse.json({error:failed.error.message},{status:500});}
      if(recipientRows.length<pageSize)break;
    }
    return NextResponse.json({audience:frozen.data});
  }
  if(action==="test"){
    if(deliveryMode()==="off")return NextResponse.json({error:"발송 모드가 off입니다."},{status:409});
    const admin=await context.supabase.from("users").select("email,display_name").eq("id",context.userId).single();if(admin.error)return NextResponse.json({error:"관리자 이메일을 찾을 수 없습니다."},{status:409});
    const adminRow=admin.data as unknown as {email:string;display_name:string|null};
    const rendered=renderEmailCampaign({templateVersion:campaign.template_version,displayName:adminRow.display_name,claimEndsAt:campaign.claim_ends_at,promotionCode:campaign.promotion_code,subjectOverride:campaign.subject,preheaderOverride:campaign.preheader,redeemUrl:campaign.campaign_type==="promotion"?`${base}/promotions/redeem`:`${base}/mypage?tab=plan`,unsubscribeUrl:campaign.campaign_type==="promotion"?`${base}/mypage?tab=account`:null});
    const sent=await sendEmail({to:adminRow.email,subject:`[테스트] ${rendered.subject}`,html:rendered.html,text:rendered.text,source:"admin-email-campaign-test",idempotencyKey:`campaign-test-${campaignId}-${Date.now()}`,headers:campaign.campaign_type==="promotion"?marketingUnsubscribeHeaders(`${base}/mypage?tab=account`):undefined});
    if(sent.error)return NextResponse.json({error:"테스트 메일을 발송하지 못했습니다."},{status:502});
    await context.supabase.from("email_campaigns_v2").update({test_sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",campaignId);
    return NextResponse.json({testSent:true,providerMessageId:sent.data?.id||null});
  }
  if(action==="schedule"){
    const scheduledAt=new Date(String(body.scheduledAt||""));if(Number.isNaN(scheduledAt.getTime()))return NextResponse.json({error:"예약 시각을 확인해 주세요."},{status:400});
    const result=await context.supabase.rpc("schedule_email_campaign_v2",{p_campaign_id:campaignId,p_scheduled_at:scheduledAt.toISOString(),p_actor:context.userId});if(result.error)return NextResponse.json({error:result.error.message},{status:409});return NextResponse.json({status:result.data});
  }
  if(["pause","resume","cancel","retry"].includes(action)){
    const result=await context.supabase.rpc("admin_email_campaign_action_v2",{p_campaign_id:campaignId,p_action:action,p_actor:context.userId});if(result.error)return NextResponse.json({error:result.error.message},{status:409});return NextResponse.json({status:result.data});
  }
  return NextResponse.json({error:"지원하지 않는 캠페인 작업입니다."},{status:400});
}
