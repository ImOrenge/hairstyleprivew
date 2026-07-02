"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/ui/Button";

type RefundStatus =
  | "pending"
  | "approved"
  | "completed"
  | "failed"
  | "manual_review_required"
  | "rejected";

const statusOptions: Array<"all" | RefundStatus> = [
  "pending",
  "approved",
  "manual_review_required",
  "failed",
  "completed",
  "rejected",
  "all",
];

const statusLabels: Record<"all" | RefundStatus, string> = {
  all: "전체",
  pending: "검토 중",
  approved: "승인됨",
  completed: "완료",
  failed: "실패",
  manual_review_required: "수동 검토",
  rejected: "반려",
};

interface PaymentRow {
  id?: string;
  user_id?: string;
  provider_order_id?: string | null;
  status?: string | null;
  amount?: number | null;
  currency?: string | null;
  credits_to_grant?: number | null;
  paid_at?: string | null;
  created_at?: string | null;
}

interface RefundRequestRow {
  id: string;
  payment_transaction_id: string;
  user_id: string;
  requested_by: string;
  approved_by: string | null;
  refund_type: "full" | "partial";
  amount_krw: number | null;
  reason: string;
  status: RefundStatus;
  portone_cancel_id: string | null;
  requested_at: string;
  approved_at: string | null;
  completed_at: string | null;
  failed_code: string | null;
  failed_message: string | null;
  payment_transactions?: PaymentRow | PaymentRow[] | null;
}

interface RefundListResponse {
  refundRequests?: RefundRequestRow[];
  error?: string;
}

function formatKrw(value: number | null | undefined) {
  return `${Math.max(0, value ?? 0).toLocaleString("ko-KR")} KRW`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function paymentOf(request: RefundRequestRow): PaymentRow {
  const payment = request.payment_transactions;
  if (Array.isArray(payment)) return payment[0] ?? {};
  return payment ?? {};
}

function statusTone(status: RefundStatus) {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "failed" || status === "rejected") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "manual_review_required") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-stone-200 bg-stone-50 text-stone-700";
}

export default function AdminRefundsPage() {
  const [status, setStatus] = useState<"all" | RefundStatus>("pending");
  const [requests, setRequests] = useState<RefundRequestRow[]>([]);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const listUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("status", status);
    return `/api/admin/payments/refund-requests?${params.toString()}`;
  }, [status]);

  const loadRefunds = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const response = await fetch(listUrl, { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as RefundListResponse;
    if (!response.ok) {
      setError(data.error || "환불 요청을 불러오지 못했습니다.");
      setIsLoading(false);
      return;
    }

    setRequests(data.refundRequests ?? []);
    setIsLoading(false);
  }, [listUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRefunds();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadRefunds]);

  async function approveRefund(request: RefundRequestRow) {
    setBusyId(request.id);
    setError(null);

    const response = await fetch(`/api/admin/payments/refunds/${encodeURIComponent(request.id)}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminNote: adminNotes[request.id] || "" }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(data.error || "환불 승인에 실패했습니다.");
      setBusyId(null);
      return;
    }

    setBusyId(null);
    await loadRefunds();
  }

  return (
    <div className="space-y-4 pb-10">
      <header className="rounded-2xl border border-stone-200 bg-white p-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Admin Refunds</p>
        <h1 className="mt-2 text-2xl font-black text-stone-950">환불 요청</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          {statusOptions.map((item) => (
            <Button
              key={item}
              type="button"
              variant={status === item ? "primary" : "secondary"}
              onClick={() => setStatus(item)}
              className="h-9 rounded-lg px-3 text-xs"
            >
              {statusLabels[item]}
            </Button>
          ))}
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <p className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-sm text-stone-500">
          환불 요청을 불러오는 중...
        </p>
      ) : null}

      {!isLoading && requests.length === 0 ? (
        <p className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-sm text-stone-500">
          표시할 환불 요청이 없습니다.
        </p>
      ) : null}

      <section className="grid gap-3">
        {requests.map((request) => {
          const payment = paymentOf(request);
          const canApprove = request.status === "pending";

          return (
            <article key={request.id} className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-1 text-xs font-bold ${statusTone(request.status)}`}>
                      {statusLabels[request.status]}
                    </span>
                    <span className="rounded-full border border-stone-200 px-2 py-1 text-xs font-bold text-stone-500">
                      {request.refund_type === "full" ? "전액" : "부분"}
                    </span>
                  </div>
                  <p className="mt-3 text-lg font-black text-stone-950">
                    {request.refund_type === "full" ? formatKrw(payment.amount) : formatKrw(request.amount_krw)}
                  </p>
                  <p className="mt-1 break-all text-xs text-stone-500">
                    결제 ID {payment.provider_order_id || "-"} / 거래 {request.payment_transaction_id}
                  </p>
                  <p className="mt-1 break-all text-xs text-stone-500">
                    사용자 {request.user_id} / 요청 {formatDate(request.requested_at)}
                  </p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-700">{request.reason}</p>
                  {request.failed_message ? (
                    <p className="mt-2 text-sm font-semibold text-rose-700">
                      {request.failed_message}
                      {request.failed_code ? ` (${request.failed_code})` : ""}
                    </p>
                  ) : null}
                  {request.portone_cancel_id ? (
                    <p className="mt-2 break-all text-xs text-stone-500">PortOne 취소 ID {request.portone_cancel_id}</p>
                  ) : null}
                </div>

                <div className="grid w-full gap-2 lg:w-[320px]">
                  <textarea
                    value={adminNotes[request.id] || ""}
                    onChange={(event) =>
                      setAdminNotes((current) => ({ ...current, [request.id]: event.target.value }))
                    }
                    rows={3}
                    placeholder="관리자 메모"
                    disabled={!canApprove || busyId === request.id}
                    className="min-h-20 rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-900 disabled:bg-stone-50"
                  />
                  <Button
                    type="button"
                    disabled={!canApprove || busyId === request.id}
                    onClick={() => void approveRefund(request)}
                    className="h-10 rounded-lg px-3 text-xs"
                  >
                    {busyId === request.id
                      ? "처리 중"
                      : request.refund_type === "full"
                        ? "전액 환불 승인"
                        : "수동 검토로 전환"}
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
