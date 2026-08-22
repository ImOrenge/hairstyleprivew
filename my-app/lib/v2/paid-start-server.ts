import "server-only";

import {
  FULL_STYLE_REFUND_POLICY_VERSION,
  FULL_STYLE_SERVICE_START_TRIGGERS,
  type FullStyleServiceStartTrigger,
} from "@hairfit/shared/v2";
import { getSupabaseAdminClient } from "../supabase";
import { HairfitV2Error } from "./errors";

export type PaidStartStateV1 = {
  policyVersion: typeof FULL_STYLE_REFUND_POLICY_VERSION;
  paid: boolean;
  required: boolean;
  activated: boolean;
  startTrigger: FullStyleServiceStartTrigger | null;
  startedAt: string | null;
  statutoryWithdrawalDeadline: string | null;
};

export async function getPaidStartStateV2(userId:string,consultationId:string):Promise<PaidStartStateV1> {
  const db=getSupabaseAdminClient();
  const session=await db.from("consultation_sessions").select("id,entitlement_grant_id")
    .eq("id",consultationId).eq("user_id",userId).maybeSingle();
  if(session.error)throw new Error(session.error.message);
  if(!session.data)throw new HairfitV2Error("CONSULTATION_NOT_FOUND",404,"상담을 찾을 수 없습니다.");
  const grantId=(session.data as {entitlement_grant_id?:string|null}).entitlement_grant_id;
  if(!grantId)return {policyVersion:FULL_STYLE_REFUND_POLICY_VERSION,paid:false,required:false,activated:false,startTrigger:null,startedAt:null,statutoryWithdrawalDeadline:null};
  const grant=await db.from("customer_entitlement_grants_v2").select("id,offering_key,source,source_transaction_id")
    .eq("id",grantId).eq("user_id",userId).maybeSingle();
  if(grant.error)throw new Error(grant.error.message);
  const grantRow=grant.data as {id:string;offering_key:string;source:string;source_transaction_id:string|null}|null;
  if(!grantRow?.offering_key.startsWith("full_style_"))return {policyVersion:FULL_STYLE_REFUND_POLICY_VERSION,paid:false,required:false,activated:false,startTrigger:null,startedAt:null,statutoryWithdrawalDeadline:null};
  if(grantRow.source==="promotion")return {policyVersion:FULL_STYLE_REFUND_POLICY_VERSION,paid:false,required:false,activated:true,startTrigger:null,startedAt:null,statutoryWithdrawalDeadline:null};
  const contract=grantRow.source_transaction_id?await db.from("full_style_contracts_v2")
    .select("id,statutory_withdrawal_deadline")
    .eq("user_id",userId).eq("latest_payment_transaction_id",grantRow.source_transaction_id)
    .eq("offering_key",grantRow.offering_key).order("created_at",{ascending:false}).limit(1).maybeSingle():null;
  if(contract?.error)throw new Error(contract.error.message);
  const activation=await db.from("full_style_service_activations_v2")
    .select("start_trigger,started_at,contract_id")
    .eq("consultation_id",consultationId).eq("entitlement_grant_id",grantId).eq("user_id",userId).maybeSingle();
  if(activation.error)throw new Error(activation.error.message);
  const row=activation.data as unknown as {start_trigger:FullStyleServiceStartTrigger;started_at:string}|null;
  const contractRow=contract?.data as {statutory_withdrawal_deadline?:string|null}|null|undefined;
  return {policyVersion:FULL_STYLE_REFUND_POLICY_VERSION,paid:true,required:!row,activated:Boolean(row),startTrigger:row?.start_trigger??null,startedAt:row?.started_at??null,statutoryWithdrawalDeadline:contractRow?.statutory_withdrawal_deadline??null};
}

export async function activatePaidConsultationV2(input:{
  userId:string;consultationId:string;startTrigger:FullStyleServiceStartTrigger;
  policyVersion:string;consentedAt:string;
}) {
  if(!(FULL_STYLE_SERVICE_START_TRIGGERS as readonly string[]).includes(input.startTrigger))throw new HairfitV2Error("INVALID_START_TRIGGER",400,"상담 시작 방식을 확인해 주세요.");
  if(input.policyVersion!==FULL_STYLE_REFUND_POLICY_VERSION)throw new HairfitV2Error("REFUND_POLICY_VERSION_MISMATCH",409,"최신 청약철회 안내를 다시 확인해 주세요.");
  const consentedAt=Date.parse(input.consentedAt);
  if(!Number.isFinite(consentedAt))throw new HairfitV2Error("PAID_START_CONSENT_REQUIRED",400,"유료 상담 시작 동의가 필요합니다.");
  const {data,error}=await getSupabaseAdminClient().rpc("activate_full_style_consultation_v2",{
    p_user_id:input.userId,p_consultation_id:input.consultationId,p_start_trigger:input.startTrigger,
    p_refund_policy_version:input.policyVersion,p_consented_at:new Date(consentedAt).toISOString(),
  });
  if(error){
    const code=error.message.toUpperCase();
    if(code.includes("PAID_FULL_STYLE_REQUIRED")||code.includes("ENTITLEMENT_UNAVAILABLE"))throw new HairfitV2Error("PAID_FULL_STYLE_REQUIRED",402,"이 상담에 사용할 유료 풀 스타일 권리가 필요합니다.");
    if(code.includes("CONTRACT_DOCUMENT_NOT_PROVIDED"))throw new HairfitV2Error("CONTRACT_DOCUMENT_NOT_PROVIDED",409,"계약 문서 제공을 확인하는 중입니다. 잠시 후 다시 시도하거나 고객센터에 문의해 주세요.");
    if(code.includes("CONTRACT_NOT_ACTIVE"))throw new HairfitV2Error("CONTRACT_NOT_ACTIVE",409,"환불 검토 중인 계약에서는 새 상담 회차를 시작할 수 없습니다.");
    if(code.includes("CONSENT")||code.includes("POLICY_VERSION"))throw new HairfitV2Error("PAID_START_CONSENT_REQUIRED",409,"최신 청약철회 안내를 확인하고 다시 동의해 주세요.");
    throw new Error(error.message);
  }
  return data;
}
