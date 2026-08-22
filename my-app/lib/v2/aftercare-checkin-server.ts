import "server-only";

import type { AftercareCheckinListV1,AftercareCheckinV1,AftercarePhotoObservationV1,OfferingCapabilities } from "@hairfit/shared/v2";
import { runAftercareCheckinResponse,runAftercarePhotoAnalysis } from "../capabilities/aftercare-checkin-service";
import { isFullStyleAftercareCheckinsEnabled } from "../consulting/feature-flag";
import { getSupabaseAdminClient } from "../supabase";
import { HairfitV2Error } from "./errors";

const BUCKET="aftercare-photos";
type Row={
  id:string;consultation_id:string;actual_service_id:string;entitlement_grant_id:string|null;slot:number;offset_days:number;scheduled_for:string;state:string;
  concern:string;satisfaction:number|null;photo_path:string|null;photo_fingerprint:string|null;photo_consent_at:string|null;photo_uploaded_at:string|null;
  observations:unknown;response:unknown;failure_message:string|null;submitted_at:string|null;completed_at:string|null;
};

function map(row:Row,revoked:boolean):AftercareCheckinV1{
  const due=row.scheduled_for<=new Date().toISOString().slice(0,10);
  const state=revoked&&row.state!=="ready"?"locked":!due&&row.state!=="ready"?"locked":row.state==="draft"?"available":row.state as AftercareCheckinV1["state"];
  return {schemaVersion:"aftercare-checkin-v1",id:row.id,consultationId:row.consultation_id,actualServiceId:row.actual_service_id,slot:row.slot,offsetDays:row.offset_days,scheduledFor:row.scheduled_for,state,concern:row.concern||"",satisfaction:row.satisfaction,photo:row.photo_fingerprint&&row.photo_uploaded_at?{fingerprint:row.photo_fingerprint,uploadedAt:row.photo_uploaded_at}:null,observations:Array.isArray(row.observations)?row.observations as AftercarePhotoObservationV1[]:[],response:row.response as AftercareCheckinV1["response"],failureMessage:row.failure_message,submittedAt:row.submitted_at,completedAt:row.completed_at};
}

async function context(userId:string,consultationId:string){
  const db=getSupabaseAdminClient();
  const service=await db.from("actual_services_v2").select("id,services,service_date").eq("user_id",userId).eq("consultation_id",consultationId).order("confirmed_at",{ascending:false}).limit(1).maybeSingle();
  if(service.error)throw new Error(service.error.message);
  if(!service.data)throw new HairfitV2Error("ACTUAL_SERVICE_REQUIRED",409,"실제 시술을 먼저 확정해 주세요.");
  const session=await db.from("consultation_sessions").select("entitlement_grant_id").eq("id",consultationId).eq("user_id",userId).maybeSingle();
  if(session.error)throw new Error(session.error.message);
  if(!session.data)throw new HairfitV2Error("CONSULTATION_NOT_FOUND",404,"상담을 찾을 수 없습니다.");
  const grantId=(session.data as {entitlement_grant_id:string|null}).entitlement_grant_id;
  const grant=grantId?await db.from("customer_entitlement_grants_v2").select("capability_snapshot,status").eq("id",grantId).eq("user_id",userId).maybeSingle():null;
  if(grant?.error)throw new Error(grant.error.message);
  const grantRow=grant?.data as {capability_snapshot?:OfferingCapabilities;status?:string}|null;
  const capabilities=grantRow?.capability_snapshot;
  const limit=Math.max(0,Math.min(3,Number(capabilities?.aftercareConsultationCount??(capabilities?.aftercare?1:0))));
  const days=(capabilities?.checkInDays?.filter((day)=>[30,60,90].includes(day))??[30]).slice(0,limit);
  return {db,service:service.data as {id:string;services:string[];service_date:string},limit,days,revoked:grantRow?.status==="revoked"};
}

export async function ensureAftercareCheckinsV2(userId:string,consultationId:string){
  const value=await context(userId,consultationId);
  if(isFullStyleAftercareCheckinsEnabled()&&value.limit>0){
    const ensured=await value.db.rpc("ensure_aftercare_checkins_v2",{p_user_id:userId,p_consultation_id:consultationId,p_actual_service_id:value.service.id,p_limit:value.limit,p_days:value.days});
    if(ensured.error)throw new Error(ensured.error.message);
  }
  return value;
}

export async function listAftercareCheckinsV2(userId:string,consultationId:string):Promise<AftercareCheckinListV1>{
  const value=await ensureAftercareCheckinsV2(userId,consultationId);
  const result=await value.db.from("aftercare_checkins_v2").select("*").eq("user_id",userId).eq("consultation_id",consultationId).order("slot");
  if(result.error)throw new Error(result.error.message);
  const checkins=(result.data??[]).map((row)=>map(row as Row,value.revoked));
  const used=checkins.filter((item)=>item.state==="ready").length;
  return {schemaVersion:"aftercare-checkin-list-v1",consultationId,limit:value.limit,used,remaining:Math.max(0,value.limit-used),revoked:value.revoked,checkins};
}

export async function saveAftercareCheckinDraftV2(input:{userId:string;consultationId:string;slot:number;concern:string;satisfaction:number|null;photo?:{path:string;fingerprint:string;consentedAt:string;uploadedAt:string}}){
  const value=await ensureAftercareCheckinsV2(input.userId,input.consultationId);
  const current=await value.db.from("aftercare_checkins_v2").select("id,state,photo_path").eq("user_id",input.userId).eq("consultation_id",input.consultationId).eq("slot",input.slot).maybeSingle();
  if(current.error)throw new Error(current.error.message);
  if(!current.data)throw new HairfitV2Error("AFTERCARE_CHECKIN_NOT_FOUND",404,"사후상담 일정을 찾을 수 없습니다.");
  if((current.data as {state:string}).state==="ready")throw new HairfitV2Error("AFTERCARE_CHECKIN_ALREADY_READY",409,"이미 완료한 사후상담입니다.");
  const update:Record<string,unknown>={concern:input.concern.trim().slice(0,2000),satisfaction:input.satisfaction,updated_at:new Date().toISOString()};
  if(input.photo)Object.assign(update,{photo_path:input.photo.path,photo_fingerprint:input.photo.fingerprint,photo_consent_at:input.photo.consentedAt,photo_uploaded_at:input.photo.uploadedAt});
  const saved=await value.db.from("aftercare_checkins_v2").update(update).eq("id",String((current.data as {id:string}).id)).eq("user_id",input.userId).select("*").single();
  if(saved.error)throw new Error(saved.error.message);
  return {checkin:map(saved.data as Row,value.revoked),previousPhotoPath:(current.data as {photo_path:string|null}).photo_path};
}

export async function submitAftercareCheckinV2(input:{userId:string;consultationId:string;slot:number;idempotencyKey:string}){
  const value=await ensureAftercareCheckinsV2(input.userId,input.consultationId);
  const selected=await value.db.from("aftercare_checkins_v2").select("*").eq("user_id",input.userId).eq("consultation_id",input.consultationId).eq("slot",input.slot).maybeSingle();
  if(selected.error)throw new Error(selected.error.message);
  if(!selected.data)throw new HairfitV2Error("AFTERCARE_CHECKIN_NOT_FOUND",404,"사후상담 일정을 찾을 수 없습니다.");
  const row=selected.data as Row;
  if(row.state==="ready")return map(row,value.revoked);
  const claimed=await value.db.rpc("claim_aftercare_checkin_v2",{p_user_id:input.userId,p_checkin_id:row.id,p_idempotency_key:input.idempotencyKey});
  if(claimed.error){
    if(claimed.error.message.includes("LOCKED"))throw new HairfitV2Error("AFTERCARE_CHECKIN_LOCKED",409,"예정일부터 사후상담을 시작할 수 있습니다.");
    if(claimed.error.message.includes("CONCERN_REQUIRED")||claimed.error.message.includes("PHOTO_REQUIRED"))throw new HairfitV2Error("AFTERCARE_CHECKIN_INPUT_REQUIRED",400,"사진과 고민을 먼저 저장해 주세요.");
    if(claimed.error.message.includes("REVOKED"))throw new HairfitV2Error("AFTERCARE_ENTITLEMENT_REVOKED",403,"환불로 회수된 미사용 사후상담입니다.");
    throw new Error(claimed.error.message);
  }
  const claimResult=claimed.data as {claimed?:boolean;checkin?:Row}|null;
  if(claimResult?.claimed===false)return map(claimResult.checkin??row,value.revoked);
  try{
    const download=await value.db.storage.from(BUCKET).download(row.photo_path!);
    if(download.error)throw new Error(download.error.message);
    const imageDataUrl=`data:image/webp;base64,${Buffer.from(await download.data.arrayBuffer()).toString("base64")}`;
    const photo=await runAftercarePhotoAnalysis({userId:input.userId,consultationId:input.consultationId,checkinId:row.id,value:{imageDataUrl,sourceFingerprint:row.photo_fingerprint!}});
    if(photo.state!=="completed"||!photo.output)throw new Error(photo.failure?.message||"사진을 확인하지 못했습니다.");
    const answer=await runAftercareCheckinResponse({userId:input.userId,consultationId:input.consultationId,checkinId:row.id,idempotencyKey:input.idempotencyKey,value:{actualService:{services:value.service.services,serviceDate:value.service.service_date},offsetDays:row.offset_days,concern:row.concern,satisfaction:row.satisfaction,observations:photo.output}});
    if(answer.state!=="completed"||!answer.output)throw new Error(answer.failure?.message||"관리 답변을 준비하지 못했습니다.");
    const completedAt=new Date().toISOString();
    const saved=await value.db.from("aftercare_checkins_v2").update({state:"ready",observations:photo.output,response:answer.output,photo_capability_task_id:photo.taskId,response_capability_task_id:answer.taskId,completed_at:completedAt,failure_code:null,failure_message:null,updated_at:completedAt}).eq("id",row.id).eq("user_id",input.userId).select("*").single();
    if(saved.error)throw new Error(saved.error.message);
    return map(saved.data as Row,value.revoked);
  }catch(error){
    const message=error instanceof Error?error.message:"관리 답변을 준비하지 못했습니다.";
    await value.db.from("aftercare_checkins_v2").update({state:"failed",failure_code:"AFTERCARE_CHECKIN_GENERATION_FAILED",failure_message:message.slice(0,500),updated_at:new Date().toISOString()}).eq("id",row.id).eq("user_id",input.userId);
    throw new HairfitV2Error("AFTERCARE_CHECKIN_GENERATION_FAILED",503,"답변 준비에 실패했습니다. 입력은 유지되며 다시 시도해도 횟수는 차감되지 않습니다.");
  }
}
