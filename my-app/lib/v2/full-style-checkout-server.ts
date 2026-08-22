import "server-only";

import { randomUUID } from "node:crypto";
import { FULL_STYLE_REFUND_POLICY_VERSION, calculateFullStyleWithdrawalDeadlineEvidence, type OfferingCapabilities } from "@hairfit/shared/v2";
import { encryptBillingKey, hashBillingKey, maskBillingKey } from "../billing-key-secret";
import { confirmPortonePayment, type PortoneConfirmationSupabaseClient } from "../portone-payment-confirmation";
import { chargeBillingKey, confirmBillingKeyIssue, readPortoneBillingKeyChannelKey, readPortoneStoreId } from "../portone";
import { getSupabaseAdminClient } from "../supabase";
import { grantEntitlementFromPaidTransactionV2 } from "./entitlement-server";
import { HairfitV2Error } from "./errors";
import { sendFullStyleContractEmail } from "../resend";
import { getSiteUrl } from "../site-url";
import { isHairfitV2Enabled } from "./feature-flags";
import { assertFullStyleContractDocumentReady, buildFullStyleContractDocument } from "./full-style-contract-document";

type PreparedRow = {
  id:string; user_id:string; consultation_id:string|null; offering_id:string; offering_key:string;
  offering_version:number; price_id:string; price_version:number; amount_minor:number; currency:string;
  purchase_mode:"one_time"|"recurring"; status:string; provider_payment_id:string; snapshot:Record<string,unknown>;
};

export function fullStylePaymentId(offeringKey:string) {
  const code = offeringKey === "full_style_once" ? "one" : offeringKey === "full_style_quarterly" ? "qtr" : "yr";
  return `fs-${code}-${Date.now().toString(36)}-${randomUUID().replaceAll("-","").slice(0,10)}`;
}

export function addBillingPeriod(start:Date, interval:"quarter"|"year"|null) {
  const end = new Date(start);
  if (interval === "quarter") end.setUTCMonth(end.getUTCMonth() + 3);
  if (interval === "year") end.setUTCFullYear(end.getUTCFullYear() + 1);
  return interval ? end : null;
}

export async function prepareFullStyleCheckout(input:{
  userId:string; offeringKey:string; priceVersion:number; consultationId?:string|null;
  customer:{ fullName:string; email:string; phoneNumber:string };
}) {
  if(isHairfitV2Enabled("FULL_STYLE_REFUND_POLICY_V2_ENABLED"))assertFullStyleContractDocumentReady();
  const db = getSupabaseAdminClient();
  const profile = await db.rpc("ensure_user_profile", {
    p_user_id:input.userId,
    p_email:input.customer.email,
    p_display_name:input.customer.fullName,
  });
  if (profile.error) throw new Error(profile.error.message);
  if (input.consultationId) {
    const owner = await db.from("consultation_sessions").select("id").eq("id",input.consultationId).eq("user_id",input.userId).maybeSingle();
    if (owner.error) throw new Error(owner.error.message);
    if (!owner.data) throw new HairfitV2Error("CONSULTATION_NOT_FOUND",404,"이어갈 상담을 찾을 수 없습니다.");
  }
  const { data, error } = await db.from("product_offerings_v2")
    .select("id,offering_key,version,customer_name,description,purchase_mode,billing_interval,included_consultation_sessions,capabilities,product_prices_v2!inner(id,version,provider,provider_product_id,currency,amount_minor,status)")
    .eq("offering_key",input.offeringKey).eq("status","active")
    .eq("product_prices_v2.version",input.priceVersion).eq("product_prices_v2.provider","portone").eq("product_prices_v2.status","active").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new HairfitV2Error("OFFERING_PRICE_NOT_FOUND",409,"선택한 상품 가격 버전을 찾을 수 없습니다.");
  const offering = data as unknown as {
    id:string; offering_key:string; version:number; customer_name:string; description:string;
    purchase_mode:"one_time"|"recurring"; billing_interval:"quarter"|"year"|null;
    included_consultation_sessions:number; capabilities:OfferingCapabilities;
    product_prices_v2:Array<{id:string;version:number;provider_product_id:string|null;currency:string;amount_minor:number}>;
  };
  const price = offering.product_prices_v2[0];
  if (!price) throw new HairfitV2Error("OFFERING_PRICE_NOT_FOUND",409,"활성 결제 가격이 없습니다.");
  const paymentId = fullStylePaymentId(offering.offering_key);
  const snapshot = {
    offeringKey:offering.offering_key, offeringVersion:offering.version, customerName:offering.customer_name,
    description:offering.description,
    priceVersion:price.version, providerProductId:price.provider_product_id, amountMinor:price.amount_minor,
    currency:price.currency, billingInterval:offering.billing_interval, includedSessions:offering.included_consultation_sessions,
    capabilities:offering.capabilities, customer:input.customer,refundPolicyVersion:FULL_STYLE_REFUND_POLICY_VERSION,
  };
  const { data: attempt, error: attemptError } = await db.from("full_style_checkout_attempts_v2").insert({
    user_id:input.userId, consultation_id:input.consultationId || null, offering_id:offering.id,
    offering_key:offering.offering_key, offering_version:offering.version, price_id:price.id,
    price_version:price.version, amount_minor:price.amount_minor, currency:price.currency,
    purchase_mode:offering.purchase_mode, provider_payment_id:paymentId, snapshot,
  }).select("id").single();
  if (attemptError || !attempt) throw new Error(attemptError?.message ?? "결제 준비를 저장하지 못했습니다.");
  const transaction = await db.from("payment_transactions").insert({
    user_id:input.userId, provider:"portone", provider_order_id:paymentId, provider_customer_id:input.userId,
    status:"pending", currency:price.currency, amount:price.amount_minor, credits_to_grant:1,
    metadata:{ source:"full-style-checkout", checkout_attempt_id:attempt.id,
      hairfit_v2_offering_key:offering.offering_key, hairfit_v2_offering_version:offering.version,
      hairfit_v2_provider_product_id:price.provider_product_id, hairfit_v2_quantity:offering.included_consultation_sessions },
  }).select("id").single();
  if (transaction.error) throw new Error(transaction.error.message);
  return { checkoutAttemptId:attempt.id, paymentId, offering, price, snapshot };
}

async function loadPrepared(userId:string, checkoutAttemptId:string) {
  const { data, error } = await getSupabaseAdminClient().from("full_style_checkout_attempts_v2")
    .select("id,user_id,consultation_id,offering_id,offering_key,offering_version,price_id,price_version,amount_minor,currency,purchase_mode,status,provider_payment_id,snapshot")
    .eq("id",checkoutAttemptId).eq("user_id",userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new HairfitV2Error("CHECKOUT_NOT_FOUND",404,"결제 준비 내역을 찾을 수 없습니다.");
  return data as unknown as PreparedRow;
}

export async function completeFullStyleCheckout(input:{ userId:string; checkoutAttemptId:string; billingKey?:string|null }) {
  const db = getSupabaseAdminClient();
  const prepared = await loadPrepared(input.userId,input.checkoutAttemptId);
  if (prepared.status === "paid") return { alreadyProcessed:true, paymentId:prepared.provider_payment_id, offeringKey:prepared.offering_key };
  const confirmation = await confirmPortonePayment({
    supabase:db as unknown as PortoneConfirmationSupabaseClient, paymentId:prepared.provider_payment_id,
    expectedUserId:input.userId, expectedAmount:prepared.amount_minor, expectedCredits:1,
    expectedCurrency:prepared.currency, source:"full-style-checkout",
  });
  if (!confirmation.ok) throw new HairfitV2Error("PAYMENT_NOT_CONFIRMED",confirmation.httpStatus,confirmation.message);
  const snapshot = prepared.snapshot;
  const interval = snapshot.billingInterval === "quarter" || snapshot.billingInterval === "year" ? snapshot.billingInterval : null;
  const startedAt = new Date();
  const refundPolicyEnabled=isHairfitV2Enabled("FULL_STYLE_REFUND_POLICY_V2_ENABLED");
  const periodEnd = addBillingPeriod(startedAt,interval);
  const encrypted = input.billingKey ? await encryptBillingKey(input.billingKey) : null;
  const hashed = input.billingKey ? await hashBillingKey(input.billingKey) : null;
  const { data: contract, error: contractError } = await db.from("full_style_contracts_v2").upsert({
    user_id:input.userId, offering_id:prepared.offering_id, offering_key:prepared.offering_key,
    offering_version:prepared.offering_version, price_id:prepared.price_id, price_version:prepared.price_version,
    price_snapshot:{ amountMinor:prepared.amount_minor,currency:prepared.currency,priceVersion:prepared.price_version },
    capability_snapshot:snapshot.capabilities ?? {}, billing_interval:interval,
    period_started_at:startedAt.toISOString(), period_ends_at:periodEnd?.toISOString() ?? null,
    next_billing_at:periodEnd?.toISOString() ?? null, provider_contract_id:prepared.provider_payment_id,
    ...(input.billingKey?{billing_key_encrypted:encrypted,billing_key_hash:hashed,billing_key_masked:maskBillingKey(input.billingKey)}:{}),
    latest_payment_transaction_id:confirmation.transaction.id,
    ...(refundPolicyEnabled?{
      refund_policy_version:FULL_STYLE_REFUND_POLICY_VERSION,
      contract_document_status:"pending",
      contract_document_last_attempted_at:null,
      contract_document_provided_at:null,
      contract_document_delivered_at:null,
      statutory_withdrawal_deadline:null,
      legal_calendar_verified:false,
    }:{}),
  }, { onConflict:"provider,provider_contract_id" }).select("id").single();
  if (contractError || !contract) throw new Error(contractError?.message ?? "계약을 저장하지 못했습니다.");
  const quantity = Number(snapshot.includedSessions ?? 1);
  await grantEntitlementFromPaidTransactionV2({
    userId:input.userId, offeringKey:prepared.offering_key, offeringVersion:prepared.offering_version,
    source:"portone", sourceTransactionId:confirmation.transaction.id, quantity,
  });
  if (periodEnd) {
    await db.from("customer_entitlement_grants_v2").update({ expires_at:periodEnd.toISOString() })
      .eq("source","portone").eq("source_transaction_id",confirmation.transaction.id)
      .eq("offering_key",prepared.offering_key);
  }
  const grant = await db.from("customer_entitlement_grants_v2").select("id").eq("source","portone")
    .eq("source_transaction_id",confirmation.transaction.id).eq("offering_key",prepared.offering_key).maybeSingle();
  if (prepared.consultation_id && grant.data) {
    await db.from("consultation_sessions").update({ entitlement_grant_id:(grant.data as {id:string}).id,
      user_restart_limit:Number((snapshot.capabilities as {hairRestartCount?:number}|undefined)?.hairRestartCount ?? 1),
      retention_policy_days:Number((snapshot.capabilities as {generatedAssetRetentionDays?:number}|undefined)?.generatedAssetRetentionDays ?? 60),
    }).eq("id",prepared.consultation_id).eq("user_id",input.userId);
  }
  const customer=snapshot.customer as {fullName?:string;email?:string}|undefined;
  let contractDocumentProvidedAt:string|null=null;
  let statutoryWithdrawalDeadline:string|null=null;
  let contractDocumentStatus:"pending"|"sent"|"delivery_uncertain"|"failed"="pending";
  if(refundPolicyEnabled&&customer?.email){
    const attemptedAt=new Date().toISOString();
    const deadlineEvidence=calculateFullStyleWithdrawalDeadlineEvidence({contractDocumentProvidedAt:attemptedAt});
    const document=buildFullStyleContractDocument({
      contractId:(contract as {id:string}).id,paymentTransactionId:confirmation.transaction.id,issuedAt:startedAt.toISOString(),
      offeringKey:prepared.offering_key,offeringLabel:String(snapshot.customerName??prepared.offering_key),
      description:String(snapshot.description??"HairFit 풀 스타일 컨설팅"),
      includedSessions:quantity,billingInterval:interval,amountKrw:prepared.amount_minor,
      nextBillingAt:periodEnd?.toISOString()??null,capabilities:(snapshot.capabilities??{}) as OfferingCapabilities,
      billingUrl:new URL("/billing",getSiteUrl()).toString(),
    });
    await db.from("full_style_contracts_v2").update({
      contract_document_snapshot:document,contract_document_last_attempted_at:attemptedAt,
    }).eq("id",(contract as {id:string}).id);
    const documentRow=await db.from("full_style_contract_documents_v2").upsert({
      contract_id:(contract as {id:string}).id,payment_transaction_id:confirmation.transaction.id,user_id:input.userId,
      policy_version:FULL_STYLE_REFUND_POLICY_VERSION,status:"pending",document_snapshot:document,last_attempted_at:attemptedAt,
    },{onConflict:"payment_transaction_id"});
    if(documentRow.error)throw new Error(documentRow.error.message);
    const emailResult=await sendFullStyleContractEmail({
      to:customer.email,displayName:customer.fullName,document,
      contractDocumentProvidedAt:attemptedAt,statutoryWithdrawalDeadline:deadlineEvidence.deadline,
    });
    contractDocumentStatus=emailResult.error?(emailResult.deliveryUncertain?"delivery_uncertain":"failed"):"sent";
    if(contractDocumentStatus==="sent"){
      contractDocumentProvidedAt=attemptedAt;
      statutoryWithdrawalDeadline=deadlineEvidence.deadline;
    }
    const evidenceUpdate=await db.from("full_style_contracts_v2").update({
      contract_document_status:contractDocumentStatus,
      contract_document_provider_message_id:emailResult.data?.id??null,
      contract_document_provided_at:contractDocumentProvidedAt,
      contract_document_delivered_at:contractDocumentProvidedAt,
      statutory_withdrawal_deadline:statutoryWithdrawalDeadline,
      legal_calendar_verified:contractDocumentStatus==="sent"&&deadlineEvidence.legalCalendarVerified,
      updated_at:new Date().toISOString(),
    }).eq("id",(contract as {id:string}).id);
    if(evidenceUpdate.error)throw new Error(evidenceUpdate.error.message);
    const documentEvidenceUpdate=await db.from("full_style_contract_documents_v2").update({
      status:contractDocumentStatus,provider_message_id:emailResult.data?.id??null,
      provided_at:contractDocumentProvidedAt,statutory_withdrawal_deadline:statutoryWithdrawalDeadline,
      legal_calendar_verified:contractDocumentStatus==="sent"&&deadlineEvidence.legalCalendarVerified,
      updated_at:new Date().toISOString(),
    }).eq("payment_transaction_id",confirmation.transaction.id);
    if(documentEvidenceUpdate.error)throw new Error(documentEvidenceUpdate.error.message);
  }
  if(!refundPolicyEnabled||contractDocumentStatus==="sent"){
    const completedAttempt=await db.from("full_style_checkout_attempts_v2").update({status:"paid",completed_at:new Date().toISOString()}).eq("id",prepared.id);
    if(completedAttempt.error)throw new Error(completedAttempt.error.message);
  }
  return { alreadyProcessed:confirmation.alreadyPaid, paymentId:prepared.provider_payment_id, offeringKey:prepared.offering_key,
    contractId:(contract as {id:string}).id, consultationId:prepared.consultation_id, periodEnd:periodEnd?.toISOString() ?? null,
    contractDocumentStatus,contractDocumentProvidedAt,statutoryWithdrawalDeadline,refundPolicyVersion:FULL_STYLE_REFUND_POLICY_VERSION };
}

export async function chargeAndCompleteFullStyleSubscription(input:{
  userId:string; checkoutAttemptId:string; billingKey:string; billingIssueToken?:string;
}) {
  const prepared = await loadPrepared(input.userId,input.checkoutAttemptId);
  if (prepared.purchase_mode !== "recurring") throw new HairfitV2Error("INVALID_PURCHASE_MODE",409,"정기 상품이 아닙니다.");
  let billingKey = input.billingKey;
  if (billingKey === "NEEDS_CONFIRMATION") {
    if (!input.billingIssueToken) throw new HairfitV2Error("BILLING_CONFIRMATION_REQUIRED",400,"빌링키 승인 토큰이 필요합니다.");
    billingKey = await confirmBillingKeyIssue({ billingIssueToken:input.billingIssueToken,storeId:readPortoneStoreId() });
  }
  const customer = prepared.snapshot.customer as { fullName?:string;email?:string;phoneNumber?:string }|undefined;
  if (!customer?.fullName || !customer.email || !customer.phoneNumber) throw new HairfitV2Error("INVALID_CUSTOMER",400,"구매자 정보를 다시 확인해 주세요.");
  const payment = await chargeBillingKey({
    paymentId:prepared.provider_payment_id,billingKey,storeId:readPortoneStoreId(),channelKey:readPortoneBillingKeyChannelKey(),
    orderName:String(prepared.snapshot.customerName ?? "HairFit 풀 스타일 정기"),amount:prepared.amount_minor,currency:prepared.currency,
    customer:{ id:input.userId,name:customer.fullName,email:customer.email,phoneNumber:customer.phoneNumber },
  });
  if (payment.status !== "PAID") throw new HairfitV2Error("PAYMENT_NOT_PAID",402,payment.failureMessage ?? "결제가 완료되지 않았습니다.");
  return completeFullStyleCheckout({ userId:input.userId,checkoutAttemptId:input.checkoutAttemptId,billingKey });
}
