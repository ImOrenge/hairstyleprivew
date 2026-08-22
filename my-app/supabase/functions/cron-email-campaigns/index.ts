import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")??"";
const SUPABASE_SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const RESEND_API_KEY=Deno.env.get("RESEND_API_KEY")??"";
const FROM=(Deno.env.get("RESEND_FROM_EMAIL")||"HairFit <noreply@hairfit.beauty>").trim();
const SITE_URL=(Deno.env.get("HAIRFIT_SITE_URL")||"https://hairfit.beauty").replace(/\/$/,"");
const MODE=(Deno.env.get("MARKETING_EMAIL_DELIVERY_MODE")||"off").trim().toLowerCase();
const TEST_TO=(Deno.env.get("MARKETING_EMAIL_TEST_TO")||"").trim().toLowerCase();

type Claimed={outbox_id:string;recipient_email:string;subject:string;html_body:string;text_body:string;idempotency_key:string;attempt_count:number;lease_token:string;unsubscribe_token:string;campaign_type:"service_notice"|"promotion"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});

async function deliver(row:Claimed){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
  const unsubscribeUrl=`${SITE_URL}/api/email/unsubscribe?token=${row.unsubscribe_token}`;
  try{
    const response=await fetch("https://api.resend.com/emails",{method:"POST",signal:controller.signal,headers:{Authorization:`Bearer ${RESEND_API_KEY}`,"Content-Type":"application/json","Idempotency-Key":row.idempotency_key},body:JSON.stringify({from:FROM,to:[row.recipient_email],subject:row.subject,html:row.html_body,text:row.text_body,headers:row.campaign_type==="promotion"?{"List-Unsubscribe":`<${unsubscribeUrl}>`,"List-Unsubscribe-Post":"List-Unsubscribe=One-Click"}:undefined})});
    const body=await response.text().catch(()=>"");
    if(!response.ok)return{messageId:null,errorKind:`resend_http_${response.status}`,error:body.slice(0,1000),retryable:response.status===408||response.status===429||response.status>=500,deliveryUnknown:false};
    const parsed=JSON.parse(body||"{}") as {id?:unknown};
    if(typeof parsed.id!=="string"||!parsed.id)return{messageId:null,errorKind:"resend_missing_id",error:"Provider accepted without id",retryable:false,deliveryUnknown:true};
    return{messageId:parsed.id,errorKind:null,error:null,retryable:false,deliveryUnknown:false};
  }catch(error){return{messageId:null,errorKind:error instanceof DOMException&&error.name==="AbortError"?"resend_timeout":"resend_network_error",error:error instanceof Error?error.message.slice(0,1000):"Provider request failed",retryable:false,deliveryUnknown:true};}
  finally{clearTimeout(timeout);}
}

Deno.serve(async request=>{
  if(request.method!=="POST")return json({error:"method_not_allowed"},405);
  if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY)return json({error:"missing_database_configuration"},503);
  const db=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const bearer=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")||"";
  const authorization=await db.rpc("authorize_email_campaign_cron_request_v2",{p_bearer:bearer});
  if(authorization.error||authorization.data!==true)return json({error:"unauthorized"},401);
  if(MODE==="off")return json({mode:"off",claimed:0,accepted:0});
  if(!RESEND_API_KEY)return json({error:"missing_resend_configuration"},503);
  if(MODE!=="live"&&(MODE!=="test"||!TEST_TO))return json({error:"invalid_delivery_mode"},503);
  const claimed=await db.rpc("claim_email_campaign_outbox_v2",{p_limit:25,p_lease_seconds:300,p_recipient_email:MODE==="test"?TEST_TO:null});
  if(claimed.error)return json({error:"claim_failed",detail:claimed.error.message},500);
  const rows=(claimed.data||[]) as Claimed[];const summary={mode:MODE,claimed:rows.length,accepted:0,retryWait:0,deadLetter:0,deliveryUnknown:0,staleLease:0};
  for(const row of rows){
    const begun=await db.rpc("begin_email_campaign_provider_attempt_v2",{p_outbox_id:row.outbox_id,p_lease_token:row.lease_token});if(begun.error||begun.data!==true){summary.staleLease+=1;continue;}
    const result=await deliver(row);const completed=await db.rpc("complete_email_campaign_provider_attempt_v2",{p_outbox_id:row.outbox_id,p_lease_token:row.lease_token,p_provider_message_id:result.messageId,p_error_kind:result.errorKind,p_error:result.error,p_retryable:result.retryable,p_delivery_unknown:result.deliveryUnknown});
    if(completed.error||completed.data==="stale_lease")summary.staleLease+=1;else if(completed.data==="provider_accepted")summary.accepted+=1;else if(completed.data==="retry_wait")summary.retryWait+=1;else if(completed.data==="delivery_unknown")summary.deliveryUnknown+=1;else if(completed.data==="dead_letter")summary.deadLetter+=1;
  }
  return json(summary);
});
