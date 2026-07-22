import { NextResponse } from "next/server";
import {
  adminActionErrorMessage,
  adminActionHttpStatus,
  isUuid,
  parseAdminActionResult,
  type AdminActionResult,
} from "../../../../../../../lib/admin-action-receipt";
import { getAdminApiContext } from "../../../../../../../lib/admin-auth";
import { cancelPortonePayment, getPayment } from "../../../../../../../lib/portone";
import {
  finalizePortoneRefundFromLookup,
  type FinalizeRefundResult,
} from "../../../../../../../lib/portone-refund-finalization";

interface Params {
  params: Promise<{ requestId: string }>;
}

interface RefundApprovalBody {
  actionKey?: unknown;
  expectedStatus?: unknown;
  expectedAmount?: unknown;
  adminNote?: unknown;
}

interface RefundRequestRow {
  id: string;
  payment_transaction_id: string;
  user_id: string;
  requested_by: string;
  refund_type: "full" | "partial";
  amount_krw: number | null;
  reason: string;
  status: string;
  portone_cancel_id: string | null;
  metadata: unknown;
}

interface PaymentTransactionRow {
  id: string;
  user_id: string;
  provider: string | null;
  provider_order_id: string | null;
  status: string | null;
  amount: number | null;
  currency: string | null;
}

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

interface SelectBuilder {
  eq: (column: string, value: unknown) => SelectBuilder;
  maybeSingle: <T>() => Promise<QueryResult<T>>;
}

interface UpdateBuilder {
  eq: (column: string, value: unknown) => Promise<{ error: { message: string } | null }>;
}

interface RefundApprovalSupabase {
  from: (table: string) => {
    select: (columns: string) => SelectBuilder;
    update: (values: Record<string, unknown>) => UpdateBuilder;
  };
  rpc: (fn: string, params: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

function trimText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function actionResponse(
  result: AdminActionResult,
  options: { status?: number; message?: string; refundRequest?: unknown; finalization?: string } = {},
) {
  const status = options.status ?? adminActionHttpStatus(result);
  return NextResponse.json(
    {
      ...result,
      refundRequest: options.refundRequest ?? result.refundRequest,
      finalization: options.finalization,
      message: options.message,
      error: status >= 400 ? options.message || adminActionErrorMessage(result) : undefined,
    },
    { status },
  );
}

async function completeRefundAction({
  supabase,
  actionKey,
  actorUserId,
  requestId,
  refundStatus,
  externalReference = null,
  errorCode = null,
  errorMessage = null,
  metadataPatch = {},
  afterState = {},
}: {
  supabase: RefundApprovalSupabase;
  actionKey: string;
  actorUserId: string;
  requestId: string;
  refundStatus: "approved" | "completed" | "manual_review_required" | "failed";
  externalReference?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadataPatch?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
}) {
  const { data, error } = await supabase.rpc("complete_admin_refund_action", {
    p_action_key: actionKey,
    p_actor_user_id: actorUserId,
    p_refund_request_id: requestId,
    p_refund_status: refundStatus,
    p_external_reference: externalReference,
    p_error_code: errorCode,
    p_error_message: errorMessage,
    p_metadata_patch: metadataPatch,
    p_after_state: afterState,
  });

  if (error) {
    throw new Error(error.message);
  }

  const result = parseAdminActionResult(data);
  if (!result) {
    throw new Error("Invalid admin refund action receipt");
  }
  return result;
}

async function persistFinalization({
  supabase,
  actionKey,
  actorUserId,
  requestId,
  finalized,
  externalReference,
  adminNote,
}: {
  supabase: RefundApprovalSupabase;
  actionKey: string;
  actorUserId: string;
  requestId: string;
  finalized: FinalizeRefundResult;
  externalReference: string | null;
  adminNote: string;
}) {
  const refundStatus = finalized.status;
  const creditClawback = finalized.status === "completed" ? finalized.creditClawback : null;
  return completeRefundAction({
    supabase,
    actionKey,
    actorUserId,
    requestId,
    refundStatus,
    externalReference,
    metadataPatch: {
      adminNote,
      finalizationStatus: finalized.status,
      creditClawback,
      providerPaymentStatus: finalized.payment.status,
    },
    afterState: {
      providerPaymentStatus: finalized.payment.status,
      creditClawback,
    },
  });
}

export async function POST(request: Request, { params }: Params) {
  const context = await getAdminApiContext();
  if (!context.ok) {
    return context.response;
  }

  const resolvedParams = await params;
  const requestId = trimText(resolvedParams.requestId, 80);
  if (!isUuid(requestId)) {
    return NextResponse.json({ error: "requestId must be a UUID" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as RefundApprovalBody;
  const actionKey = isUuid(body.actionKey) ? body.actionKey : null;
  const expectedStatus =
    body.expectedStatus === "pending" || body.expectedStatus === "manual_review_required"
      ? body.expectedStatus
      : null;
  const expectedAmount =
    typeof body.expectedAmount === "number" && Number.isInteger(body.expectedAmount) && body.expectedAmount > 0
      ? body.expectedAmount
      : null;
  const adminNote = trimText(body.adminNote, 500);

  if (!actionKey) {
    return NextResponse.json({ error: "actionKey must be a UUID" }, { status: 400 });
  }
  if (!expectedStatus || expectedAmount === null) {
    return NextResponse.json({ error: "expected refund status and amount are required" }, { status: 400 });
  }

  const supabase = context.supabase as unknown as RefundApprovalSupabase;
  if (expectedStatus === "manual_review_required") {
    const { error: preparationError } = await supabase.rpc("prepare_manual_refund_approval", {
      p_refund_request_id: requestId,
      p_actor_user_id: context.userId,
    });
    if (preparationError) {
      return NextResponse.json({ error: preparationError.message }, { status: 409 });
    }
  }
  const { data: begunData, error: beginError } = await supabase.rpc("begin_admin_refund_approval", {
    p_action_key: actionKey,
    p_actor_user_id: context.userId,
    p_refund_request_id: requestId,
    p_expected_status: "pending",
    p_expected_amount: expectedAmount,
    p_admin_note: adminNote,
  });

  if (beginError) {
    return NextResponse.json({ error: beginError.message }, { status: 500 });
  }

  const begun = parseAdminActionResult(begunData);
  if (!begun) {
    return NextResponse.json({ error: "Invalid admin refund action receipt" }, { status: 500 });
  }

  if (["conflict", "failed", "already_processed", "succeeded"].includes(begun.outcome)) {
    return actionResponse(begun);
  }

  const reconcileOnly = begun.replayed;
  const { data: refundRequest, error: requestError } = await supabase
    .from("payment_refund_requests")
    .select("id,payment_transaction_id,user_id,requested_by,refund_type,amount_krw,reason,status,portone_cancel_id,metadata")
    .eq("id", requestId)
    .maybeSingle<RefundRequestRow>();

  if (requestError || !refundRequest) {
    const message = requestError?.message || "환불 요청을 찾지 못했습니다.";
    try {
      const failed = await completeRefundAction({
        supabase,
        actionKey,
        actorUserId: context.userId,
        requestId,
        refundStatus: "failed",
        errorCode: "refund_request_not_found",
        errorMessage: message,
      });
      return actionResponse(failed, { status: 404, message });
    } catch {
      return NextResponse.json({ error: message, receipt: begun.receipt }, { status: 404 });
    }
  }

  const { data: transaction, error: txError } = await supabase
    .from("payment_transactions")
    .select("id,user_id,provider,provider_order_id,status,amount,currency")
    .eq("id", refundRequest.payment_transaction_id)
    .maybeSingle<PaymentTransactionRow>();

  const failClaimedRefund = async (code: string, message: string, status: number) => {
    try {
      const failed = await completeRefundAction({
        supabase,
        actionKey,
        actorUserId: context.userId,
        requestId,
        refundStatus: "failed",
        errorCode: code,
        errorMessage: message,
        metadataPatch: { adminNote, failureCode: code, failureMessage: message },
      });
      return actionResponse(failed, { status, message });
    } catch (finalizeError) {
      console.error("[admin/refunds] Failed to persist refund failure receipt", finalizeError);
      return NextResponse.json({ error: message, receipt: begun.receipt }, { status });
    }
  };

  if (txError || !transaction || transaction.user_id !== refundRequest.user_id) {
    return failClaimedRefund(
      "transaction_not_found",
      txError?.message || "환불 대상 결제를 찾지 못했습니다.",
      404,
    );
  }
  if (transaction.provider !== "portone" || !transaction.provider_order_id) {
    return failClaimedRefund("unsupported_provider", "PortOne 결제가 아닙니다.", 409);
  }
  if (!reconcileOnly && transaction.status !== "paid") {
    return failClaimedRefund("transaction_not_paid", "결제 완료 상태가 아닙니다.", 409);
  }

  let payment;
  try {
    payment = await getPayment(transaction.provider_order_id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "PortOne 결제 조회에 실패했습니다.";
    if (!reconcileOnly) {
      return failClaimedRefund("portone_lookup_failed", message, 502);
    }

    const pending = await completeRefundAction({
      supabase,
      actionKey,
      actorUserId: context.userId,
      requestId,
      refundStatus: "approved",
      errorCode: "portone_recheck_pending",
      errorMessage: message,
      metadataPatch: { lastProviderRecheckAt: new Date().toISOString(), lastProviderRecheckError: message },
    });
    return actionResponse(pending, {
      status: 202,
      message: "PortOne 취소 결과를 아직 확인하지 못했습니다. 잠시 후 같은 작업으로 다시 조회해 주세요.",
    });
  }

  if (!payment) {
    if (!reconcileOnly) {
      return failClaimedRefund("portone_payment_not_found", "PortOne 결제를 찾지 못했습니다.", 404);
    }

    const pending = await completeRefundAction({
      supabase,
      actionKey,
      actorUserId: context.userId,
      requestId,
      refundStatus: "approved",
      errorCode: "portone_recheck_pending",
      errorMessage: "PortOne 결제를 찾지 못했습니다.",
    });
    return actionResponse(pending, {
      status: 202,
      message: "외부 결제 상태 확인이 필요합니다. 같은 작업으로 다시 조회해 주세요.",
    });
  }

  const providerAlreadyCancelled =
    payment.status === "CANCELLED" ||
    (payment.status === "PARTIAL_CANCELLED" && reconcileOnly && Boolean(refundRequest.portone_cancel_id));
  const providerLedgerMismatch =
    payment.amountTotal !== transaction.amount || payment.currency !== transaction.currency;
  if (providerLedgerMismatch) {
    if (reconcileOnly || providerAlreadyCancelled) {
      const pending = await completeRefundAction({
        supabase,
        actionKey,
        actorUserId: context.userId,
        requestId,
        refundStatus: "approved",
        errorCode: "portone_payment_mismatch_manual_review",
        errorMessage: "PortOne 결제 금액 또는 통화가 내부 원장과 일치하지 않습니다.",
        afterState: {
          providerPaymentStatus: payment.status,
          providerAmount: payment.amountTotal,
          providerCurrency: payment.currency,
        },
      });
      return actionResponse(pending, {
        status: 202,
        message: "외부 결제 금액 또는 통화가 내부 원장과 달라 자동 최종화를 중단했습니다. 수동 검토가 필요합니다.",
      });
    }

    return failClaimedRefund(
      "portone_payment_mismatch",
      "PortOne 결제 상태 또는 금액이 내부 원장과 일치하지 않습니다.",
      409,
    );
  }

  if (!providerAlreadyCancelled && payment.status !== "PAID") {
    if (reconcileOnly) {
      const pending = await completeRefundAction({
        supabase,
        actionKey,
        actorUserId: context.userId,
        requestId,
        refundStatus: "approved",
        errorCode: "portone_recheck_pending",
        errorMessage: "PortOne 결제가 아직 취소 완료 상태가 아닙니다.",
        afterState: { providerPaymentStatus: payment.status },
      });
      return actionResponse(pending, {
        status: 202,
        message: "PortOne 취소 결과를 확인 중입니다. 잠시 후 같은 작업으로 다시 조회해 주세요.",
      });
    }

    return failClaimedRefund("portone_payment_mismatch", "PortOne 결제 상태가 결제 완료가 아닙니다.", 409);
  }

  if (reconcileOnly && !providerAlreadyCancelled) {
    const pending = await completeRefundAction({
      supabase,
      actionKey,
      actorUserId: context.userId,
      requestId,
      refundStatus: "approved",
      errorCode: "portone_recheck_pending",
      errorMessage: "PortOne 취소 완료 상태를 기다리고 있습니다.",
      afterState: { providerPaymentStatus: payment.status },
    });
    return actionResponse(pending, {
      status: 202,
      message: "중복 취소를 실행하지 않고 PortOne 상태만 확인했습니다. 잠시 후 다시 조회해 주세요.",
    });
  }

  let externalReference: string | null = begun.receipt.external_reference;
  if (!providerAlreadyCancelled) {
    try {
      const cancellation = await cancelPortonePayment({
        paymentId: transaction.provider_order_id,
        reason: `HairFit 환불 승인: ${refundRequest.reason}`,
        requester: "ADMIN",
        amount:
          refundRequest.refund_type === "partial"
            ? Math.max(0, refundRequest.amount_krw ?? 0)
            : Math.max(0, transaction.amount ?? 0),
        currentCancellableAmount: Math.max(
          0,
          payment.amountCancellable ?? payment.amountTotal - (payment.amountCancelled ?? 0),
        ),
      });
      externalReference = cancellation.cancellationId;
    } catch (error) {
      const message = error instanceof Error ? error.message : "PortOne 결제 취소 결과를 확인하지 못했습니다.";
      const pending = await completeRefundAction({
        supabase,
        actionKey,
        actorUserId: context.userId,
        requestId,
        refundStatus: "approved",
        errorCode: "portone_cancel_outcome_unknown",
        errorMessage: message,
        metadataPatch: {
          adminNote,
          providerOutcome: "unknown",
          providerRecheckRequired: true,
        },
      });
      return actionResponse(pending, {
        status: 202,
        message: "PortOne 응답이 불확실해 실패로 단정하지 않았습니다. 같은 작업으로 외부 상태를 재조회해 주세요.",
      });
    }
  }

  try {
    const finalized = await finalizePortoneRefundFromLookup({
      supabase,
      paymentId: transaction.provider_order_id,
      refundRequestId: refundRequest.id,
    });
    const persisted = await persistFinalization({
      supabase,
      actionKey,
      actorUserId: context.userId,
      requestId,
      finalized,
      externalReference,
      adminNote,
    });

    if (finalized.status === "approved") {
      return actionResponse(persisted, {
        status: 202,
        finalization: "provider_pending",
        message: "PortOne 취소 요청은 접수되었고 최종 상태 반영을 기다리고 있습니다.",
      });
    }

    return actionResponse(persisted, {
      finalization: finalized.status,
      message:
        finalized.status === "completed"
          ? "환불과 내부 크레딧 정산을 완료했습니다."
          : "부분 취소가 확인되어 수동 검토 상태로 전환했습니다.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "환불 확정 상태 반영에 실패했습니다.";
    const pending = await completeRefundAction({
      supabase,
      actionKey,
      actorUserId: context.userId,
      requestId,
      refundStatus: "approved",
      externalReference,
      errorCode: "refund_finalization_deferred",
      errorMessage: message,
      metadataPatch: {
        adminNote,
        finalizationStatus: "deferred",
        finalizationError: message,
      },
    });
    return actionResponse(pending, {
      status: 202,
      finalization: "provider_pending",
      message: "외부 취소는 접수되었지만 내부 최종화가 대기 중입니다. 같은 작업으로 재조회해 주세요.",
    });
  }
}
