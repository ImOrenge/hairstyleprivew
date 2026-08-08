import "server-only";
import type { EntitlementDecisionV2, EntitlementGrantV2, OfferingCapabilities, OfferingKey } from "@hairfit/shared/v2";
import { getCreditsPerStyle } from "../pricing-plan";
import { getSupabaseAdminClient } from "../supabase";
import { HairfitV2Error } from "./errors";
import { isLegacyEntitlementBridgeEnabled } from "./feature-flags";

type GrantRow = { id:string; user_id:string; offering_key:string; offering_version:number; capability_snapshot:OfferingCapabilities; quantity_granted:number; quantity_consumed:number; status:EntitlementGrantV2["status"]; source:EntitlementGrantV2["source"]; source_transaction_id:string|null; valid_from:string; expires_at:string|null };
const EMPTY_CAPABILITIES: OfferingCapabilities = { acceptedHairPreviews:9,salonBrief:true,aftercare:true,personalColor:false,fashionPreviews:0,generatedAssetRetentionDays:7 };
function remaining(row: GrantRow) { return Math.max(0,row.quantity_granted-row.quantity_consumed); }
export async function quoteEntitlementV2(userId:string, offeringKey:OfferingKey):Promise<EntitlementDecisionV2> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdminClient().from("customer_entitlement_grants_v2").select("id,user_id,offering_key,offering_version,capability_snapshot,quantity_granted,quantity_consumed,status,source,source_transaction_id,valid_from,expires_at").eq("user_id",userId).eq("offering_key",offeringKey).eq("status","active").lte("valid_from",now).or(`expires_at.is.null,expires_at.gt.${now}`).order("expires_at",{ascending:true,nullsFirst:false}).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  const grant = data as unknown as GrantRow | null;
  if (grant && remaining(grant)>0) return { schemaVersion:"entitlement-decision-v1",allowed:true,reason:"allowed",offeringKey,grantId:grant.id,remainingSessions:remaining(grant),capabilities:grant.capability_snapshot,decisionVersion:grant.offering_version,decidedAt:now,source:"v2" };
  if (isLegacyEntitlementBridgeEnabled() && offeringKey === "hair_decision_once") {
    const { data:user,error:userError } = await getSupabaseAdminClient().from("users").select("credits").eq("id",userId).maybeSingle();
    if (userError) throw new Error(userError.message);
    const credits = Number((user as unknown as {credits?:number}|null)?.credits ?? 0);
    if (credits >= getCreditsPerStyle()) return { schemaVersion:"entitlement-decision-v1",allowed:true,reason:"allowed",offeringKey,grantId:null,remainingSessions:1,capabilities:EMPTY_CAPABILITIES,decisionVersion:1,decidedAt:now,source:"legacy_bridge" };
  }
  return { schemaVersion:"entitlement-decision-v1",allowed:false,reason:grant?.status === "expired" ? "expired" : grant && remaining(grant)===0 ? "exhausted" : "no_grant",offeringKey,grantId:null,remainingSessions:0,capabilities:null,decisionVersion:1,decidedAt:now,source:"v2" };
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
