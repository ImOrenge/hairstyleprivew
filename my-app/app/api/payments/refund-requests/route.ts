import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { mapRefundRequestRow, drainRefundExecutions } from "../../../../lib/refund-automation";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../../lib/supabase";
import { callSupabaseRpc } from "../../../../lib/supabase-rpc";

interface RefundRequestBody {
  paymentTransactionId?: unknown;
  refundType?: unknown;
  amountKrw?: unknown;
  reason?: unknown;
  quoteId?: unknown;
  idempotencyKey?: unknown;
  acceptedAmountKrw?: unknown;
  answers?: unknown;
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

interface RefundRequestRow {
  id: string;
  payment_transaction_id: string;
  status: string;
  refund_type: string;
  amount_krw: number | null;
  reason: string;
  requested_at: string;
}

interface QueryResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

interface RefundRequestSupabase {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        maybeSingle: <T>() => Promise<QueryResult<T>>;
      };
    };
    insert: (values: Record<string, unknown>) => {
      select: (columns: string) => {
        single: <T>() => Promise<QueryResult<T>>;
      };
    };
  };
}

function trimText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeRefundType(value: unknown): "full" | "partial" {
  return value === "partial" ? "partial" : "full";
}

function normalizeAmount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const amount = Math.round(value);
  return amount > 0 ? amount : null;
}

function isOpenRefundDuplicate(error: { message: string; code?: string } | null) {
  return error?.code === "23505" || error?.message.toLowerCase().includes("duplicate");
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as RefundRequestBody;
  const quoteId = trimText(body.quoteId, 80);
  if (quoteId) {
    const idempotencyKey = trimText(body.idempotencyKey, 80);
    const acceptedAmountKrw =
      typeof body.acceptedAmountKrw === "number" && Number.isInteger(body.acceptedAmountKrw)
        ? body.acceptedAmountKrw
        : null;
    const answers =
      body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
        ? (body.answers as Record<string, unknown>)
        : null;
    if (!/^[0-9a-f-]{36}$/i.test(quoteId) || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
      return NextResponse.json({ error: "환불 견적 또는 요청 키가 올바르지 않습니다." }, { status: 400 });
    }
    if (acceptedAmountKrw === null || acceptedAmountKrw < 0 || !answers) {
      return NextResponse.json({ error: "확인한 환불 금액과 인터뷰 답변이 필요합니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await callSupabaseRpc(supabase, "submit_payment_refund_request", {
      p_user_id: userId,
      p_quote_id: quoteId,
      p_idempotency_key: idempotencyKey,
      p_accepted_amount_krw: acceptedAmountKrw,
      p_answers: answers,
    });
    if (error) {
      const status = error.message.includes("expired") || error.message.includes("changed") ? 409 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    let refundRequest = mapRefundRequestRow(data as never);
    if (refundRequest.decision === "automatic") {
      await drainRefundExecutions(1).catch(() => null);
      const refreshed = await getSupabaseAdminClient()
        .from("payment_refund_requests")
        .select("id,payment_transaction_id,status,outcome_choice,reason_category,decision,risk_codes,amount_krw,original_amount_krw,credits_to_claw_back,requested_at,completed_at,support_case_id,failed_message")
        .eq("id", refundRequest.id)
        .single();
      if (refreshed.data) refundRequest = mapRefundRequestRow(refreshed.data as never);
    }
    return NextResponse.json(
      { refundRequest, executionMode: refundRequest.decision },
      { status: refundRequest.status === "completed" ? 200 : 202 },
    );
  }
  const paymentTransactionId = trimText(body.paymentTransactionId, 80);
  const reason = trimText(body.reason, 500);
  const refundType = normalizeRefundType(body.refundType);
  const amountKrw = normalizeAmount(body.amountKrw);

  if (!paymentTransactionId) {
    return NextResponse.json({ error: "paymentTransactionId is required" }, { status: 400 });
  }
  if (reason.length < 5) {
    return NextResponse.json({ error: "환불 사유를 5자 이상 입력해주세요." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient() as unknown as RefundRequestSupabase;
  const { data: transaction, error: txError } = await supabase
    .from("payment_transactions")
    .select("id,user_id,provider,provider_order_id,status,amount,currency")
    .eq("id", paymentTransactionId)
    .maybeSingle<PaymentTransactionRow>();

  if (txError) {
    return NextResponse.json({ error: txError.message }, { status: 500 });
  }
  if (!transaction || transaction.user_id !== userId) {
    return NextResponse.json({ error: "Payment transaction not found" }, { status: 404 });
  }
  if (transaction.provider !== "portone" || !transaction.provider_order_id) {
    return NextResponse.json({ error: "PortOne 결제만 환불 요청할 수 있습니다." }, { status: 409 });
  }
  if (transaction.status !== "paid") {
    return NextResponse.json({ error: "결제 완료 상태의 거래만 환불 요청할 수 있습니다." }, { status: 409 });
  }
  if (transaction.currency !== "KRW") {
    return NextResponse.json({ error: "KRW 결제만 환불 요청할 수 있습니다." }, { status: 409 });
  }
  if (refundType === "partial") {
    if (!amountKrw || amountKrw >= Math.max(0, transaction.amount ?? 0)) {
      return NextResponse.json({ error: "부분환불 금액을 결제 금액보다 작게 입력해주세요." }, { status: 400 });
    }
  }

  const { data: refundRequest, error: insertError } = await supabase
    .from("payment_refund_requests")
    .insert({
      payment_transaction_id: transaction.id,
      user_id: userId,
      requested_by: userId,
      refund_type: refundType,
      amount_krw: refundType === "partial" ? amountKrw : null,
      reason,
      status: "pending",
      metadata: {
        source: "mypage",
        providerOrderId: transaction.provider_order_id,
      },
    })
    .select("id,payment_transaction_id,status,refund_type,amount_krw,reason,requested_at")
    .single<RefundRequestRow>();

  if (insertError) {
    if (isOpenRefundDuplicate(insertError)) {
      return NextResponse.json(
        { error: "이미 처리 대기 중인 환불 요청이 있습니다." },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ refundRequest }, { status: 201 });
}
