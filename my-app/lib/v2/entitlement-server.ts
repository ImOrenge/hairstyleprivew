import "server-only";
import type { EntitlementDecisionV2, EntitlementGrantV2, OfferingCapabilities, OfferingKey } from "@hairfit/shared/v2";
import { getCreditsPerStyle } from "../pricing-plan";
import { getSupabaseAdminClient } from "../supabase";
import { HairfitV2Error } from "./errors";
import { isHairfitV2Enabled, isLegacyEntitlementBridgeEnabled } from "./feature-flags";

type GrantRow = { id:string; user_id:string; offering_key:string; offering_version:number; capability_snapshot:OfferingCapabilities; quantity_granted:number; quantity_consumed:number; status:EntitlementGrantV2["status"]; source:EntitlementGrantV2["source"]; source_transaction_id:string|null; valid_from:string; expires_at:string|null };
const EMPTY_CAPABILITIES: OfferingCapabilities = {
  acceptedHairPreviews:9,watermarkGeneratedAssets:false,hairRestartCount:0,finalHairSelectionCount:1,salonBrief:true,
  aftercare:true,aftercareConsultationCount:1,checkInDays:[30],personalColor:false,personalColorMode:"quick_photo",hairColor:false,makeup:false,
  aiNarrative:false,pdf:false,fashionPreviews:0,fashionAdditionalPreviews:0,
  beforeAfterComparison:false,annualSummary:false,annualArchive:false,generatedAssetRetentionDays:7,
};
const PAID_FULL_STYLE_KEYS = ["full_style_once", "full_style_quarterly", "full_style_annual"] as const;
function remaining(row: GrantRow) { return Math.max(0,row.quantity_granted-row.quantity_consumed); }
export async function quoteEntitlementV2(userId:string, offeringKey:OfferingKey):Promise<EntitlementDecisionV2> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdminClient().from("customer_entitlement_grants_v2").select("id,user_id,offering_key,offering_version,capability_snapshot,quantity_granted,quantity_consumed,status,source,source_transaction_id,valid_from,expires_at").eq("user_id",userId).eq("offering_key",offeringKey).eq("status","active").lte("valid_from",now).or(`expires_at.is.null,expires_at.gt.${now}`).order("expires_at",{ascending:true,nullsFirst:false}).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  const grant = data as unknown as GrantRow | null;
  if (grant && remaining(grant)>0) return { schemaVersion:"entitlement-decision-v1",allowed:true,reason:"allowed",offeringKey,grantId:grant.id,remainingSessions:remaining(grant),capabilities:grant.capability_snapshot,decisionVersion:grant.offering_version,decidedAt:now,source:"v2",grantSource:grant.source };
  if (isLegacyEntitlementBridgeEnabled() && offeringKey === "hair_decision_once") {
    const { data:user,error:userError } = await getSupabaseAdminClient().from("users").select("credits").eq("id",userId).maybeSingle();
    if (userError) throw new Error(userError.message);
    const credits = Number((user as unknown as {credits?:number}|null)?.credits ?? 0);
    if (credits >= getCreditsPerStyle()) return { schemaVersion:"entitlement-decision-v1",allowed:true,reason:"allowed",offeringKey,grantId:null,remainingSessions:1,capabilities:EMPTY_CAPABILITIES,decisionVersion:1,decidedAt:now,source:"legacy_bridge",grantSource:"legacy_credit_bridge" };
  }
  return { schemaVersion:"entitlement-decision-v1",allowed:false,reason:grant?.status === "expired" ? "expired" : grant && remaining(grant)===0 ? "exhausted" : "no_grant",offeringKey,grantId:null,remainingSessions:0,capabilities:null,decisionVersion:1,decidedAt:now,source:"v2",grantSource:null };
}

export async function ensureFreeHairDemoGrantV2(userId: string) {
  if (!isHairfitV2Enabled("FREE_HAIR_DEMO_ENABLED")) return null;
  const db = getSupabaseAdminClient();
  const { data: offering, error: offeringError } = await db.from("product_offerings_v2")
    .select("id,version,capabilities,status").eq("offering_key", "free_hair_demo").eq("status", "active").maybeSingle();
  if (offeringError) throw new Error(offeringError.message);
  if (!offering) return null;
  const row = offering as unknown as { id:string; version:number; capabilities:OfferingCapabilities };
  const { data, error } = await db.from("customer_entitlement_grants_v2").upsert({
    user_id:userId, offering_id:row.id, offering_key:"free_hair_demo", offering_version:row.version,
    capability_snapshot:row.capabilities, quantity_granted:1, source:"manual",
    source_transaction_id:`free-hair-demo:${userId}`,
  }, { onConflict:"source,source_transaction_id,offering_key", ignoreDuplicates:true }).select("id").maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function quoteFullStyleAccessV2(userId: string) {
  for (const offeringKey of PAID_FULL_STYLE_KEYS) {
    const decision = await quoteEntitlementV2(userId, offeringKey);
    if (decision.allowed) return { ...decision, access:"paid" as const, requiresPaidStart:decision.grantSource !== "promotion" };
  }
  await ensureFreeHairDemoGrantV2(userId);
  const free = await quoteEntitlementV2(userId, "free_hair_demo");
  return { ...free, access:free.allowed ? "demo" as const : "none" as const, requiresPaidStart:false };
}

export async function quoteFullStyleConsultationAccessV2(userId:string,consultationId:string) {
  const db=getSupabaseAdminClient();
  const session=await db.from("consultation_sessions").select("id,entitlement_grant_id")
    .eq("id",consultationId).eq("user_id",userId).maybeSingle();
  if(session.error) throw new Error(session.error.message);
  if(!session.data) throw new HairfitV2Error("CONSULTATION_NOT_FOUND",404,"상담을 찾을 수 없습니다.");
  const grantId=(session.data as {entitlement_grant_id?:string|null}).entitlement_grant_id;
  if(grantId) {
    const attached=await db.from("customer_entitlement_grants_v2")
      .select("id,offering_key,offering_version,capability_snapshot,status,source")
      .eq("id",grantId).eq("user_id",userId).maybeSingle();
    if(attached.error) throw new Error(attached.error.message);
    const grant=attached.data as {id:string;offering_key:string;offering_version:number;capability_snapshot:OfferingCapabilities;status:string;source:EntitlementGrantV2["source"]}|null;
    if(grant&&grant.status!=="revoked") {
      const paid=grant.offering_key.startsWith("full_style_");
      if(paid||grant.offering_key==="free_hair_demo") return {
        schemaVersion:"entitlement-decision-v1" as const,allowed:true,reason:"allowed" as const,
        offeringKey:grant.offering_key,grantId:grant.id,remainingSessions:0,capabilities:grant.capability_snapshot,
        decisionVersion:grant.offering_version,decidedAt:new Date().toISOString(),source:"v2" as const,
        access:paid?"paid" as const:"demo" as const,
        grantSource:grant.source,
        requiresPaidStart:paid && grant.source !== "promotion",
      };
    }
  }
  return quoteFullStyleAccessV2(userId);
}

export async function consumeFullStyleGenerationEntitlementV2(input:{userId:string;consultationId:string;idempotencyKey:string}) {
  const decision = await quoteFullStyleConsultationAccessV2(input.userId,input.consultationId);
  if (!decision.allowed) throw new HairfitV2Error("ENTITLEMENT_UNAVAILABLE",402,"이 상담에 사용할 수 있는 이용 권리가 없습니다.");
  if (!decision.grantId) throw new HairfitV2Error("ENTITLEMENT_GRANT_NOT_FOUND",409,"이 상담의 이용 권리를 다시 확인해 주세요.");
  const existing=await getSupabaseAdminClient().from("entitlement_consumptions_v2")
    .select("id,state,grant_id").eq("user_id",input.userId).eq("consultation_id",input.consultationId)
    .eq("grant_id",decision.grantId).neq("state","restored").maybeSingle();
  if(existing.error) throw new Error(existing.error.message);
  if(existing.data&&(existing.data as {state:string}).state!=="restored") return {
    id:(existing.data as {id:string}).id,state:(existing.data as {state:string}).state,
    grantId:(existing.data as {grant_id:string}).grant_id,replayed:true,
  };
  const consumption = await consumeEntitlementV2({ ...input, offeringKey:decision.offeringKey });
  const grantId = (consumption as { grantId?:unknown }|null)?.grantId;
  if (typeof grantId === "string") {
    await getSupabaseAdminClient().from("consultation_sessions").update({
      entitlement_grant_id:grantId,
      user_restart_limit:Number(decision.capabilities?.hairRestartCount ?? 0),
      retention_policy_days:Number(decision.capabilities?.generatedAssetRetentionDays ?? 7),
    })
      .eq("id",input.consultationId).eq("user_id",input.userId);
  }
  return consumption;
}
async function createLegacyBridgeGrant(userId:string,offeringKey:OfferingKey,consultationId:string,capabilities:OfferingCapabilities) {
  const db=getSupabaseAdminClient();
  const { data:offering,error:offeringError }=await db.from("product_offerings_v2").select("id,version").eq("offering_key",offeringKey).eq("status","active").limit(1).maybeSingle();
  if(offeringError) throw new Error(offeringError.message);
  if(!offering) throw new HairfitV2Error("V2_OFFERING_NOT_ACTIVE",409,"V2 상품이 아직 활성화되지 않았습니다.");
  const row=offering as unknown as {id:string;version:number};
  const sourceTransactionId=`legacy:${userId}:${consultationId}`;
  const { data,error }=await db.from("customer_entitlement_grants_v2").upsert({user_id:userId,offering_id:row.id,offering_key:offeringKey,offering_version:row.version,capability_snapshot:capabilities,quantity_granted:1,source:"legacy_credit_bridge",source_transaction_id:sourceTransactionId},{onConflict:"source,source_transaction_id,offering_key"}).select("id").single();
  if(error) throw new Error(error.message);
  return (data as unknown as {id:string}).id;
}
export async function consumeEntitlementV2(input:{userId:string;offeringKey:OfferingKey;consultationId:string;idempotencyKey:string}) {
  const decision=await quoteEntitlementV2(input.userId,input.offeringKey);
  if(!decision.allowed||!decision.capabilities) throw new HairfitV2Error("ENTITLEMENT_UNAVAILABLE",402,"이 상담에 사용할 수 있는 이용 권리가 없습니다.");
  if(!decision.grantId) await createLegacyBridgeGrant(input.userId,input.offeringKey,input.consultationId,decision.capabilities);
  const {data,error}=await getSupabaseAdminClient().rpc("consume_entitlement_v2",{p_user_id:input.userId,p_offering_key:input.offeringKey,p_consultation_id:input.consultationId,p_idempotency_key:input.idempotencyKey});
  if(error) throw new HairfitV2Error("ENTITLEMENT_CONSUME_FAILED",409,"이용 권리를 예약하지 못했습니다. 상태를 새로고침해 주세요.");
  return data as unknown;
}
export async function grantEntitlementFromPaidTransactionV2(input:{userId:string;offeringKey:string;offeringVersion:number;source:"portone"|"google_play";sourceTransactionId:string;quantity:number}) {
  const db=getSupabaseAdminClient();
  const {data:offering,error}=await db.from("product_offerings_v2").select("id,capabilities,status").eq("offering_key",input.offeringKey).eq("version",input.offeringVersion).maybeSingle();
  if(error) throw new Error(error.message); if(!offering) throw new HairfitV2Error("OFFERING_VERSION_NOT_FOUND",409,"결제 상품 버전을 찾을 수 없습니다.");
  const row=offering as unknown as {id:string;capabilities:OfferingCapabilities;status:string}; if(row.status!=="active") throw new HairfitV2Error("OFFERING_INACTIVE",409,"활성 상품이 아닙니다.");
  const {data,error:insertError}=await db.from("customer_entitlement_grants_v2").upsert({user_id:input.userId,offering_id:row.id,offering_key:input.offeringKey,offering_version:input.offeringVersion,capability_snapshot:row.capabilities,quantity_granted:input.quantity,source:input.source,source_transaction_id:input.sourceTransactionId},{onConflict:"source,source_transaction_id,offering_key",ignoreDuplicates:true}).select("id").maybeSingle();
  if(insertError) throw new Error(insertError.message); return data;
}
