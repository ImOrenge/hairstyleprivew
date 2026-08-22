import "server-only";

import {
  REFUND_POLICY_VERSION,
  REFUND_QUOTE_TTL_MS,
  calculateProportionalRefundKrw,
  decideRefund,
  type RefundQuote,
  type RefundQuoteRequest,
  type RefundRequestStatus,
  type RefundRequestSummary,
} from "@hairfit/shared";
import {
  FULL_STYLE_REFUND_POLICY_VERSION,
  decideFullStyleRefund,
} from "@hairfit/shared/v2";
import { decryptBillingKey } from "./billing-key-secret";
import {
  cancelPortonePayment,
  deleteBillingKey,
  getPayment,
  isPortoneConfigured,
} from "./portone";
import { getSupabaseAdminClient } from "./supabase";
import { callSupabaseRpc } from "./supabase-rpc";
import { isHairfitV2Enabled } from "./v2/feature-flags";

const OPEN_REFUND_STATUSES: RefundRequestStatus[] = [
  "pending",
  "queued",
  "processing",
  "cancel_pending",
  "approved",
  "period_end_scheduled",
  "manual_review_required",
];

interface PaymentRow {
  id: string;
  user_id: string;
  provider: string | null;
  provider_order_id: string | null;
  subscription_id: string | null;
  status: string | null;
  amount: number | null;
  currency: string | null;
  credits_to_grant: number | null;
  paid_at: string | null;
  metadata: Record<string,unknown> | null;
}

interface FullStyleContractRow {
  id:string;offering_key:string;price_snapshot:Record<string,unknown>;period_ends_at:string|null;
  latest_payment_transaction_id:string|null;contract_document_provided_at:string|null;
  contract_document_status:string;statutory_withdrawal_deadline:string|null;created_at:string;
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_key: string | null;
  status: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  pg_billing_key: string | null;
  pg_billing_key_encrypted: string | null;
}

interface CreditLotRow {
  id: string;
  granted_credits: number;
  remaining_credits: number;
  held_credits: number;
  reconciliation_status: string;
}

interface UserRow {
  credits: number | null;
}

interface RefundDatabaseRow {
  id: string;
  payment_transaction_id: string;
  status: RefundRequestStatus;
  outcome_choice: RefundRequestSummary["outcome"] | null;
  reason_category: RefundRequestSummary["reasonCategory"] | null;
  decision: RefundRequestSummary["decision"] | null;
  risk_codes: string[] | null;
  amount_krw: number | null;
  original_amount_krw: number | null;
  credits_to_claw_back: number | null;
  requested_at: string;
  completed_at: string | null;
  support_case_id: string | null;
  failed_message: string | null;
}

interface RefundOutboxRow {
  id: string;
  refund_request_id: string;
  attempt_count: number;
}

function dateInRange(value: string | null, start: string | null, end: string | null) {
  if (!value || !start || !end) return false;
  const time = new Date(value).getTime();
  return time >= new Date(start).getTime() && time <= new Date(end).getTime();
}

function isMissingRelation(message: string) {
  const value = message.toLowerCase();
  return value.includes("does not exist") || value.includes("schema cache");
}

export function mapRefundRequestRow(row: RefundDatabaseRow): RefundRequestSummary {
  return {
    id: row.id,
    paymentTransactionId: row.payment_transaction_id,
    status: row.status,
    outcome: row.outcome_choice ?? "immediate_refund_and_cancel",
    reasonCategory: row.reason_category ?? "other",
    decision: row.decision ?? "manual",
    riskCodes: (row.risk_codes ?? []) as RefundRequestSummary["riskCodes"],
    refundAmountKrw: Math.max(0, row.amount_krw ?? row.original_amount_krw ?? 0),
    creditsToClawBack: Math.max(0, row.credits_to_claw_back ?? 0),
    requestedAt: row.requested_at,
    completedAt: row.completed_at,
    supportCaseId: row.support_case_id,
    failureMessage: row.failed_message,
  };
}

export async function createRefundQuote(
  userId: string,
  input: RefundQuoteRequest,
): Promise<RefundQuote> {
  const supabase = getSupabaseAdminClient();
  const { data: transaction, error: transactionError } = await supabase
    .from("payment_transactions")
    .select("id,user_id,provider,provider_order_id,subscription_id,status,amount,currency,credits_to_grant,paid_at,metadata")
    .eq("id", input.paymentTransactionId)
    .eq("user_id", userId)
    .maybeSingle<PaymentRow>();

  if (transactionError) throw new Error(transactionError.message);
  if (!transaction) throw new Error("환불 대상 결제를 찾지 못했습니다.");
  if (transaction.provider !== "portone" || !transaction.provider_order_id) {
    throw new Error("PortOne 결제만 환불 요청할 수 있습니다.");
  }
  if (transaction.currency !== "KRW" || transaction.status !== "paid") {
    throw new Error("결제 완료 상태의 KRW 거래만 환불 요청할 수 있습니다.");
  }

  if(["full-style-checkout","cron-full-style-renewal"].includes(String(transaction.metadata?.source??""))&&isHairfitV2Enabled("FULL_STYLE_REFUND_POLICY_V2_ENABLED")){
    const contractResult=await supabase.from("full_style_contracts_v2")
      .select("id,offering_key,price_snapshot,period_ends_at,latest_payment_transaction_id,contract_document_provided_at,contract_document_status,statutory_withdrawal_deadline,created_at")
      .eq("user_id",userId).eq("latest_payment_transaction_id",transaction.id).maybeSingle<FullStyleContractRow>();
    if(contractResult.error)throw new Error(contractResult.error.message);
    if(!contractResult.data)throw new Error("풀 스타일 환불 대상 계약을 찾지 못했습니다.");
    return createFullStyleRefundQuote({supabase,userId,input,transaction,contract:contractResult.data});
  }

  const [subscriptionResult, lotResult, userResult, openRefundResult, reservationResult, historyResult] =
    await Promise.all([
      supabase
        .from("user_subscriptions")
        .select("id,user_id,plan_key,status,current_period_start,current_period_end,pg_billing_key,pg_billing_key_encrypted")
        .eq("user_id", userId)
        .maybeSingle<SubscriptionRow>(),
      supabase
        .from("credit_grant_lots")
        .select("id,granted_credits,remaining_credits,held_credits,reconciliation_status")
        .eq("payment_transaction_id", transaction.id)
        .maybeSingle<CreditLotRow>(),
      supabase.from("users").select("credits").eq("id", userId).maybeSingle<UserRow>(),
      supabase
        .from("payment_refund_requests")
        .select("id")
        .eq("payment_transaction_id", transaction.id)
        .in("status", OPEN_REFUND_STATUSES)
        .limit(1),
      supabase
        .from("generation_credit_reservations")
        .select("id")
        .eq("user_id", userId)
        .eq("state", "reserved")
        .limit(1),
      supabase
        .from("payment_refund_requests")
        .select("id")
        .eq("user_id", userId)
        .gte("requested_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
        .limit(3),
    ]);

  const structuralError =
    subscriptionResult.error || lotResult.error || userResult.error || openRefundResult.error;
  if (structuralError) throw new Error(structuralError.message);
  if (reservationResult.error && !isMissingRelation(reservationResult.error.message)) {
    throw new Error(reservationResult.error.message);
  }
  if (historyResult.error) throw new Error(historyResult.error.message);

  const subscription = subscriptionResult.data;
  const lot = lotResult.data;
  const accountCredits = Math.max(0, userResult.data?.credits ?? 0);
  const creditsGranted = Math.max(0, lot?.granted_credits ?? transaction.credits_to_grant ?? 0);
  const creditsRemaining = Math.max(
    0,
    Math.min(creditsGranted, (lot?.remaining_credits ?? 0) - (lot?.held_credits ?? 0)),
  );
  const currentBillingPeriod = Boolean(
    subscription &&
      subscription.id === transaction.subscription_id &&
      dateInRange(transaction.paid_at, subscription.current_period_start, subscription.current_period_end),
  );

  let providerLookupFailed = false;
  let providerAmountMatches = false;
  let providerCancellableAmountKrw = Math.max(0, transaction.amount ?? 0);
  let previousPartialCancellation = false;

  if (input.outcome === "immediate_refund_and_cancel") {
    if (!isPortoneConfigured()) {
      providerLookupFailed = true;
    } else {
      try {
        const payment = await getPayment(transaction.provider_order_id);
        if (!payment) {
          providerLookupFailed = true;
        } else {
          providerAmountMatches =
            payment.amountTotal === transaction.amount && payment.currency === transaction.currency;
          providerCancellableAmountKrw = Math.max(
            0,
            payment.amountCancellable ?? payment.amountTotal - (payment.amountCancelled ?? 0),
          );
          previousPartialCancellation =
            payment.status === "PARTIAL_CANCELLED" || (payment.amountCancelled ?? 0) > 0;
        }
      } catch {
        providerLookupFailed = true;
      }
    }
  } else {
    providerAmountMatches = true;
  }

  const decisionResult = decideRefund({
    outcome: input.outcome,
    reasonCategory: input.reasonCategory,
    planKey: subscription?.plan_key ?? null,
    automationEnabled: process.env.REFUND_AUTOMATION_ENABLED === "true",
    currentBillingPeriod,
    ledgerReconciled: lot?.reconciliation_status === "reconciled",
    providerAmountMatches,
    hasOpenRefund: (openRefundResult.data?.length ?? 0) > 0,
    hasPendingCreditUsage: (reservationResult.data?.length ?? 0) > 0,
    hasPreviousPartialCancellation: previousPartialCancellation,
    providerLookupFailed,
    repeatBehaviorReview: (historyResult.data?.length ?? 0) >= 2,
  });

  const refundAmountKrw =
    input.outcome === "cancel_at_period_end"
      ? 0
      : calculateProportionalRefundKrw({
          originalAmountKrw: transaction.amount ?? 0,
          creditsGranted,
          creditsRemaining,
          providerCancellableAmountKrw,
        });
  const expiresAt = new Date(Date.now() + REFUND_QUOTE_TTL_MS).toISOString();
  const { data: quoteRow, error: quoteError } = await supabase
    .from("payment_refund_quotes")
    .insert({
      payment_transaction_id: transaction.id,
      user_id: userId,
      outcome_choice: input.outcome,
      reason_category: input.reasonCategory,
      interview_answers: input.answers,
      decision: decisionResult.decision,
      risk_codes: decisionResult.riskCodes,
      policy_version: REFUND_POLICY_VERSION,
      original_amount_krw: Math.max(0, transaction.amount ?? 0),
      provider_cancellable_amount_krw: providerCancellableAmountKrw,
      credits_granted: creditsGranted,
      credits_remaining: creditsRemaining,
      credits_to_claw_back: input.outcome === "cancel_at_period_end" ? 0 : creditsRemaining,
      preserved_credits: Math.max(0, accountCredits - creditsRemaining),
      refund_amount_krw: refundAmountKrw,
      credit_lot_id: lot?.id ?? null,
      subscription_ends_at:
        input.outcome === "cancel_at_period_end" ? subscription?.current_period_end ?? null : null,
      expires_at: expiresAt,
    })
    .select("id")
    .single<{ id: string }>();
  if (quoteError || !quoteRow) throw new Error(quoteError?.message || "환불 견적을 저장하지 못했습니다.");

  return {
    id: quoteRow.id,
    paymentTransactionId: transaction.id,
    outcome: input.outcome,
    reasonCategory: input.reasonCategory,
    decision: decisionResult.decision,
    riskCodes: decisionResult.riskCodes,
    policyVersion: REFUND_POLICY_VERSION,
    originalAmountKrw: Math.max(0, transaction.amount ?? 0),
    providerCancellableAmountKrw,
    creditsGranted,
    creditsRemaining,
    creditsUsed: Math.max(0, creditsGranted - creditsRemaining),
    creditsToClawBack: input.outcome === "cancel_at_period_end" ? 0 : creditsRemaining,
    preservedCredits: Math.max(0, accountCredits - creditsRemaining),
    refundAmountKrw,
    expiresAt,
    subscriptionEndsAt:
      input.outcome === "cancel_at_period_end" ? subscription?.current_period_end ?? null : null,
  };
}

async function createFullStyleRefundQuote(input:{
  supabase:ReturnType<typeof getSupabaseAdminClient>;userId:string;input:RefundQuoteRequest;
  transaction:PaymentRow;contract:FullStyleContractRow;
}):Promise<RefundQuote>{
  const {supabase,userId,transaction,contract}=input;
  const [activationResult,grantResult,openRefundResult,historyResult]=await Promise.all([
    supabase.from("full_style_service_activations_v2").select("started_at")
      .eq("contract_id",contract.id).eq("payment_transaction_id",transaction.id).eq("user_id",userId).order("started_at",{ascending:true}),
    supabase.from("customer_entitlement_grants_v2").select("quantity_granted,quantity_consumed,status")
      .eq("source","portone").eq("source_transaction_id",transaction.id).eq("offering_key",contract.offering_key).maybeSingle(),
    supabase.from("payment_refund_requests").select("id").eq("payment_transaction_id",transaction.id)
      .in("status",OPEN_REFUND_STATUSES).limit(1),
    supabase.from("payment_refund_requests").select("id").eq("user_id",userId)
      .gte("requested_at",new Date(Date.now()-90*24*60*60*1000).toISOString()).limit(3),
  ]);
  const structuralError=activationResult.error||grantResult.error||openRefundResult.error||historyResult.error;
  if(structuralError)throw new Error(structuralError.message);
  const grant=grantResult.data as {quantity_granted?:number;quantity_consumed?:number;status?:string}|null;
  const includedSessions=Math.max(1,Number(grant?.quantity_granted??(contract.offering_key==="full_style_annual"?4:1)));
  const activations=(activationResult.data??[]) as Array<{started_at:string}>;

  let providerLookupFailed=false;
  let providerAmountMatches=input.input.outcome==="cancel_at_period_end";
  let providerCancellableAmountKrw=Math.max(0,transaction.amount??0);
  let previousPartialCancellation=false;
  if(input.input.outcome==="immediate_refund_and_cancel"){
    if(!isPortoneConfigured())providerLookupFailed=true;
    else try{
      const payment=await getPayment(transaction.provider_order_id!);
      if(!payment)providerLookupFailed=true;
      else{
        providerAmountMatches=payment.amountTotal===transaction.amount&&payment.currency===transaction.currency;
        providerCancellableAmountKrw=Math.max(0,payment.amountCancellable??payment.amountTotal-(payment.amountCancelled??0));
        previousPartialCancellation=payment.status==="PARTIAL_CANCELLED"||(payment.amountCancelled??0)>0;
      }
    }catch{providerLookupFailed=true;}
  }

  const fullStyle=decideFullStyleRefund({
    now:new Date().toISOString(),contractId:contract.id,offeringKey:contract.offering_key,
    originalAmountKrw:transaction.amount??0,providerCancellableAmountKrw,includedSessions,
    startedSessions:activations.length,contractDocumentProvidedAt:contract.contract_document_status==="sent"?contract.contract_document_provided_at:null,
    serviceStartedAt:activations[0]?.started_at??null,reasonCategory:input.input.reasonCategory,
  });
  const riskCodes:RefundQuote["riskCodes"]=[];
  if(input.input.outcome==="immediate_refund_and_cancel"){
    if(fullStyle.eligibilityCode==="window_expired")riskCodes.push("withdrawal_window_expired");
    if(fullStyle.eligibilityCode==="started_session_restriction")riskCodes.push("started_session_restriction");
    if(fullStyle.eligibilityCode==="exception_review")riskCodes.push("full_style_exception_review");
    if(fullStyle.eligibilityCode==="document_delivery_unverified")riskCodes.push("contract_document_unverified");
    if(fullStyle.eligibilityCode==="legal_calendar_review")riskCodes.push("legal_calendar_review");
    if(providerLookupFailed)riskCodes.push("provider_lookup_failed");
    if(!providerAmountMatches)riskCodes.push("provider_amount_mismatch");
    if(previousPartialCancellation)riskCodes.push("previous_partial_cancellation");
    if((openRefundResult.data?.length??0)>0)riskCodes.push("existing_open_refund");
    if((historyResult.data?.length??0)>=2)riskCodes.push("repeat_behavior_review");
  }
  const decision=input.input.outcome==="cancel_at_period_end"?"period_end":"manual";
  const refundAmountKrw=input.input.outcome==="cancel_at_period_end"?0:fullStyle.estimatedRefundAmountKrw;
  const expiresAt=new Date(Date.now()+REFUND_QUOTE_TTL_MS).toISOString();
  const {data:quoteRow,error:quoteError}=await supabase.from("payment_refund_quotes").insert({
    payment_transaction_id:transaction.id,user_id:userId,outcome_choice:input.input.outcome,
    reason_category:input.input.reasonCategory,interview_answers:input.input.answers,decision,risk_codes:riskCodes,
    policy_version:FULL_STYLE_REFUND_POLICY_VERSION,original_amount_krw:Math.max(0,transaction.amount??0),
    provider_cancellable_amount_krw:providerCancellableAmountKrw,credits_granted:includedSessions,
    credits_remaining:fullStyle.unusedSessions,credits_to_claw_back:input.input.outcome==="cancel_at_period_end"?0:fullStyle.unusedSessions,
    preserved_credits:0,refund_amount_krw:refundAmountKrw,credit_lot_id:null,
    subscription_ends_at:input.input.outcome==="cancel_at_period_end"?contract.period_ends_at:null,
    expires_at:expiresAt,product_family:"full_style",full_style_contract_id:contract.id,
    contract_document_delivered_at:fullStyle.contractDocumentProvidedAt,
    contract_document_provided_at:fullStyle.contractDocumentProvidedAt,service_started_at:fullStyle.serviceStartedAt,
    statutory_withdrawal_deadline:fullStyle.statutoryWithdrawalDeadline,
    legal_calendar_verified:fullStyle.legalCalendarVerified,recovery_status:fullStyle.recoveryStatus,
    full_style_started_sessions:fullStyle.startedSessions,full_style_unused_sessions:fullStyle.unusedSessions,
    full_style_session_unit_amount_krw:fullStyle.sessionUnitAmountKrw,
    refund_eligibility_code:fullStyle.eligibilityCode,eligible_for_immediate_refund:fullStyle.eligibleForImmediateRefund,
  }).select("id").single<{id:string}>();
  if(quoteError||!quoteRow)throw new Error(quoteError?.message||"환불 견적을 저장하지 못했습니다.");
  return {
    id:quoteRow.id,paymentTransactionId:transaction.id,outcome:input.input.outcome,
    reasonCategory:input.input.reasonCategory,decision,riskCodes,policyVersion:FULL_STYLE_REFUND_POLICY_VERSION,
    originalAmountKrw:Math.max(0,transaction.amount??0),providerCancellableAmountKrw,
    creditsGranted:includedSessions,creditsRemaining:fullStyle.unusedSessions,
    creditsUsed:fullStyle.startedSessions,creditsToClawBack:input.input.outcome==="cancel_at_period_end"?0:fullStyle.unusedSessions,
    preservedCredits:0,refundAmountKrw,expiresAt,
    subscriptionEndsAt:input.input.outcome==="cancel_at_period_end"?contract.period_ends_at:null,fullStyle,
  };
}

export async function getRefundRequestForUser(userId: string, requestId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("payment_refund_requests")
    .select("id,payment_transaction_id,status,outcome_choice,reason_category,decision,risk_codes,amount_krw,original_amount_krw,credits_to_claw_back,requested_at,completed_at,support_case_id,failed_message")
    .eq("id", requestId)
    .eq("user_id", userId)
    .maybeSingle<RefundDatabaseRow>();
  if (error) throw new Error(error.message);
  return data ? mapRefundRequestRow(data) : null;
}

async function removeSubscriptionBillingKey(subscription: SubscriptionRow | null) {
  if (!subscription) return;
  const billingKey = subscription.pg_billing_key_encrypted
    ? await decryptBillingKey(subscription.pg_billing_key_encrypted)
    : subscription.pg_billing_key;
  if (billingKey) await deleteBillingKey(billingKey);
}

export async function drainRefundExecutions(limit = 5) {
  const supabase = getSupabaseAdminClient();
  const results: Array<{ requestId: string; status: string; error?: string }> = [];

  for (let index = 0; index < Math.max(1, Math.min(limit, 20)); index += 1) {
    const leaseToken = crypto.randomUUID();
    const { data: claimed, error: claimError } = await callSupabaseRpc(supabase, "claim_refund_execution", {
      p_lease_token: leaseToken,
      p_lease_seconds: 120,
    });
    if (claimError) throw new Error(claimError.message);
    if (!claimed) break;
    const outbox = claimed as RefundOutboxRow;

    const { data: requestRow, error: requestError } = await supabase
      .from("payment_refund_requests")
      .select("id,payment_transaction_id,user_id,reason,amount_krw,original_amount_krw,credits_to_claw_back")
      .eq("id", outbox.refund_request_id)
      .single<{
        id: string;
        payment_transaction_id: string;
        user_id: string;
        reason: string;
        amount_krw: number | null;
        original_amount_krw: number | null;
        credits_to_claw_back: number | null;
      }>();
    if (requestError || !requestRow) {
      await callSupabaseRpc(supabase, "finish_refund_execution", {
        p_outbox_id: outbox.id,
        p_lease_token: leaseToken,
        p_status: "dead_letter",
        p_error: requestError?.message || "refund_request_not_found",
      });
      continue;
    }

    try {
      const [{ data: transaction, error: transactionError }, { data: subscription }] = await Promise.all([
        supabase
          .from("payment_transactions")
          .select("id,provider_order_id,amount,currency,status")
          .eq("id", requestRow.payment_transaction_id)
          .single<{ id: string; provider_order_id: string | null; amount: number; currency: string; status: string }>(),
        supabase
          .from("user_subscriptions")
          .select("id,user_id,plan_key,status,current_period_start,current_period_end,pg_billing_key,pg_billing_key_encrypted")
          .eq("user_id", requestRow.user_id)
          .maybeSingle<SubscriptionRow>(),
      ]);
      if (transactionError || !transaction?.provider_order_id) {
        throw new Error(transactionError?.message || "refund_payment_not_found");
      }
      const amount = Math.max(0, requestRow.amount_krw ?? requestRow.original_amount_krw ?? 0);
      if (amount === 0) {
        await removeSubscriptionBillingKey(subscription);
        await callSupabaseRpc(supabase, "finish_refund_execution", {
          p_outbox_id: outbox.id,
          p_lease_token: leaseToken,
          p_status: "completed",
        });
        await supabase
          .from("user_subscriptions")
          .update({
            status: "canceled",
            cancel_at_period_end: true,
            canceled_at: new Date().toISOString(),
            pg_billing_key: null,
            pg_billing_key_encrypted: null,
            pg_billing_key_hash: null,
          })
          .eq("user_id", requestRow.user_id);
        results.push({ requestId: requestRow.id, status: "completed" });
        continue;
      }

      const providerPayment = await getPayment(transaction.provider_order_id);
      if (!providerPayment || providerPayment.amountTotal !== transaction.amount || providerPayment.currency !== transaction.currency) {
        throw new Error("provider_amount_mismatch");
      }
      const currentCancellableAmount = Math.max(
        0,
        providerPayment.amountCancellable ?? providerPayment.amountTotal - (providerPayment.amountCancelled ?? 0),
      );
      if (currentCancellableAmount < amount) throw new Error("provider_cancellable_amount_changed");

      const cancellation = await cancelPortonePayment({
        paymentId: transaction.provider_order_id,
        reason: requestRow.reason,
        requester: "CUSTOMER",
        amount,
        currentCancellableAmount,
      });
      await removeSubscriptionBillingKey(subscription);
      await callSupabaseRpc(supabase, "finish_refund_execution", {
        p_outbox_id: outbox.id,
        p_lease_token: leaseToken,
        p_status: "cancel_pending",
        p_provider_cancel_id: cancellation.cancellationId,
      });
      results.push({ requestId: requestRow.id, status: "cancel_pending" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "refund_execution_failed";
      const terminal = outbox.attempt_count >= 5 || message.includes("mismatch") || message.includes("changed");
      await callSupabaseRpc(supabase, "finish_refund_execution", {
        p_outbox_id: outbox.id,
        p_lease_token: leaseToken,
        p_status: terminal ? "dead_letter" : "retry_wait",
        p_error: message,
      });
      results.push({ requestId: requestRow.id, status: terminal ? "failed" : "retry_wait", error: message });
    }
  }

  return results;
}
