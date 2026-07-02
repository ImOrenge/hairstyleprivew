import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../../../../lib/admin-auth";
import { cancelPortonePayment, getPayment } from "../../../../../../../lib/portone";
import { finalizePortoneRefundFromLookup } from "../../../../../../../lib/portone-refund-finalization";

interface Params {
  params: Promise<{ requestId: string }>;
}

interface RefundApprovalBody {
  adminNote?: unknown;
}

interface RefundRequestRow {
  id: string;
  payment_transaction_id: string;
  user_id: string;
  requested_by: string;
  refund_type: string;
  amount_krw: number | null;
  reason: string;
  status: string;
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

type UpdateEqResult = Promise<{ error: { message: string } | null }> & {
  select: (columns: string) => {
    single: <T>() => Promise<QueryResult<T>>;
  };
};

interface UpdateBuilder {
  eq: (column: string, value: unknown) => UpdateEqResult;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metadataOf(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

async function updateRefundRequest(
  supabase: RefundApprovalSupabase,
  requestId: string,
  values: Record<string, unknown>,
) {
  return supabase
    .from("payment_refund_requests")
    .update(values)
    .eq("id", requestId)
    .select(
      "id,payment_transaction_id,user_id,refund_type,amount_krw,reason,status,portone_cancel_id,requested_at,approved_at,completed_at,failed_code,failed_message,metadata",
    )
    .single<Record<string, unknown>>();
}

async function failRefundRequest(
  supabase: RefundApprovalSupabase,
  request: RefundRequestRow,
  code: string,
  message: string,
) {
  return updateRefundRequest(supabase, request.id, {
    status: "failed",
    failed_code: code,
    failed_message: message,
    metadata: {
      ...metadataOf(request.metadata),
      failureCode: code,
      failureMessage: message,
      failedAt: new Date().toISOString(),
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
  if (!requestId) {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as RefundApprovalBody;
  const adminNote = trimText(body.adminNote, 500);
  const supabase = context.supabase as unknown as RefundApprovalSupabase;

  const { data: refundRequest, error: requestError } = await supabase
    .from("payment_refund_requests")
    .select("id,payment_transaction_id,user_id,requested_by,refund_type,amount_krw,reason,status,metadata")
    .eq("id", requestId)
    .maybeSingle<RefundRequestRow>();

  if (requestError) {
    return NextResponse.json({ error: requestError.message }, { status: 500 });
  }
  if (!refundRequest) {
    return NextResponse.json({ error: "Refund request not found" }, { status: 404 });
  }
  if (refundRequest.status !== "pending") {
    return NextResponse.json({ refundRequest, alreadyProcessed: true }, { status: 200 });
  }

  if (refundRequest.refund_type !== "full") {
    const { data, error } = await updateRefundRequest(supabase, refundRequest.id, {
      status: "manual_review_required",
      approved_by: context.userId,
      approved_at: new Date().toISOString(),
      metadata: {
        ...metadataOf(refundRequest.metadata),
        adminNote,
        manualReviewReason: "partial_refund_policy_not_automated",
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ refundRequest: data }, { status: 200 });
  }

  const { data: transaction, error: txError } = await supabase
    .from("payment_transactions")
    .select("id,user_id,provider,provider_order_id,status,amount,currency")
    .eq("id", refundRequest.payment_transaction_id)
    .maybeSingle<PaymentTransactionRow>();

  if (txError) {
    return NextResponse.json({ error: txError.message }, { status: 500 });
  }
  if (!transaction || transaction.user_id !== refundRequest.user_id) {
    await failRefundRequest(supabase, refundRequest, "transaction_not_found", "환불 대상 결제를 찾지 못했습니다.");
    return NextResponse.json({ error: "Payment transaction not found" }, { status: 404 });
  }
  if (transaction.provider !== "portone" || !transaction.provider_order_id) {
    await failRefundRequest(supabase, refundRequest, "unsupported_provider", "PortOne 결제가 아닙니다.");
    return NextResponse.json({ error: "PortOne 결제가 아닙니다." }, { status: 409 });
  }
  if (transaction.status !== "paid") {
    await failRefundRequest(supabase, refundRequest, "transaction_not_paid", "결제 완료 상태가 아닙니다.");
    return NextResponse.json({ error: "결제 완료 상태가 아닙니다." }, { status: 409 });
  }

  let payment;
  try {
    payment = await getPayment(transaction.provider_order_id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "PortOne 결제 조회에 실패했습니다.";
    await failRefundRequest(supabase, refundRequest, "portone_lookup_failed", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (!payment) {
    await failRefundRequest(supabase, refundRequest, "portone_payment_not_found", "PortOne 결제를 찾지 못했습니다.");
    return NextResponse.json({ error: "PortOne 결제를 찾지 못했습니다." }, { status: 404 });
  }
  if (
    payment.status !== "PAID" ||
    payment.amountTotal !== transaction.amount ||
    payment.currency !== transaction.currency
  ) {
    await failRefundRequest(
      supabase,
      refundRequest,
      "portone_payment_mismatch",
      "PortOne 결제 상태 또는 금액이 내부 원장과 일치하지 않습니다.",
    );
    return NextResponse.json(
      { error: "PortOne 결제 상태 또는 금액이 내부 원장과 일치하지 않습니다." },
      { status: 409 },
    );
  }

  let cancellation;
  try {
    cancellation = await cancelPortonePayment({
      paymentId: transaction.provider_order_id,
      reason: `HairFit 환불 승인: ${refundRequest.reason}`,
      requester: "ADMIN",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PortOne 결제 취소에 실패했습니다.";
    await failRefundRequest(supabase, refundRequest, "portone_cancel_failed", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  let finalized;
  try {
    finalized = await finalizePortoneRefundFromLookup({
      supabase,
      paymentId: transaction.provider_order_id,
      refundRequestId: refundRequest.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "환불 확정 상태 반영에 실패했습니다.";
    const { data: updated, error: updateError } = await updateRefundRequest(supabase, refundRequest.id, {
      status: "approved",
      approved_by: context.userId,
      approved_at: new Date().toISOString(),
      portone_cancel_id: cancellation.cancellationId,
      failed_code: "refund_finalization_deferred",
      failed_message: message,
      metadata: {
        ...metadataOf(refundRequest.metadata),
        adminNote,
        portoneCancellation: cancellation,
        finalizationStatus: "deferred",
        finalizationError: message,
      },
    });

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ refundRequest: updated, finalization: "deferred" }, { status: 202 });
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await updateRefundRequest(supabase, refundRequest.id, {
    status: finalized.status,
    approved_by: context.userId,
    approved_at: now,
    completed_at: finalized.status === "completed" ? now : null,
    portone_cancel_id: cancellation.cancellationId,
    failed_code: null,
    failed_message: null,
    metadata: {
      ...metadataOf(refundRequest.metadata),
      adminNote,
      portoneCancellation: cancellation,
      finalizationStatus: finalized.status,
      creditClawback:
        finalized.status === "completed" ? finalized.creditClawback : null,
    },
  });

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ refundRequest: updated, finalization: finalized.status }, { status: 200 });
}
