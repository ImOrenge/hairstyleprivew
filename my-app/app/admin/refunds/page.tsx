"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/ui/Button";
import { ConfirmActionDialog } from "../../../components/ui/ConfirmActionDialog";
import { isUuid, type AdminActionOutcome, type AdminActionReceipt } from "../../../lib/admin-action-receipt";
import { mapWebResponseError } from "../../../lib/web-user-message";

type RefundStatus =
  | "pending"
  | "queued"
  | "processing"
  | "cancel_pending"
  | "approved"
  | "completed"
  | "failed"
  | "manual_review_required"
  | "period_end_scheduled"
  | "rejected";

const statusOptions: Array<"all" | RefundStatus> = [
  "pending",
  "queued",
  "processing",
  "cancel_pending",
  "approved",
  "manual_review_required",
  "period_end_scheduled",
  "failed",
  "completed",
  "rejected",
  "all",
];

const statusLabels: Record<"all" | RefundStatus, string> = {
  all: "전체",
  pending: "검토 중",
  queued: "자동 처리 대기",
  processing: "처리 중",
  cancel_pending: "취소 확인 중",
  approved: "승인됨",
  completed: "완료",
  failed: "실패",
  manual_review_required: "수동 검토",
  period_end_scheduled: "다음 갱신 중단",
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
  outcome_choice?: string | null;
  reason_category?: string | null;
  decision?: string | null;
  risk_codes?: string[] | null;
  policy_version?: string | null;
  original_amount_krw?: number | null;
  provider_cancellable_amount_krw?: number | null;
  credits_granted?: number | null;
  credits_remaining?: number | null;
  credits_to_claw_back?: number | null;
  preserved_credits?: number | null;
  support_case_id?: string | null;
  metadata?: Record<string, unknown> | null;
  payment_transactions?: PaymentRow | PaymentRow[] | null;
}

interface RefundListResponse {
  refundRequests?: RefundRequestRow[];
  error?: string;
}

interface RefundMutationResponse {
  outcome?: AdminActionOutcome;
  receipt?: AdminActionReceipt;
  error?: string;
  message?: string;
}

interface PendingRefundAction {
  request: RefundRequestRow;
  actionKey: string;
  amount: number;
  adminNote: string;
  recheckOnly: boolean;
}

interface ActionNotice {
  outcome: AdminActionOutcome;
  receipt: AdminActionReceipt;
  message: string;
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
  if (status === "manual_review_required" || status === "processing" || status === "queued" || status === "cancel_pending") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-stone-200 bg-stone-50 text-stone-700";
}

function metadataString(request: RefundRequestRow, key: string) {
  const value = request.metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function outcomeLabel(outcome: AdminActionOutcome) {
  if (outcome === "succeeded") return "완료";
  if (outcome === "already_processed") return "이미 처리됨";
  if (outcome === "provider_pending") return "외부 상태 확인 필요";
  if (outcome === "processing") return "처리 중";
  if (outcome === "conflict") return "최신 상태 충돌";
  return "실패";
}

function noticeTone(outcome: AdminActionOutcome) {
  if (outcome === "conflict" || outcome === "failed") {
    return "border-rose-200 bg-rose-50 text-rose-900";
  }
  if (outcome === "processing" || outcome === "provider_pending") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

export default function AdminRefundsPage() {
  const [status, setStatus] = useState<"all" | RefundStatus>("pending");
  const [requests, setRequests] = useState<RefundRequestRow[]>([]);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingRefundAction | null>(null);
  const [confirmationText, setConfirmationText] = useState("");
  const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null);

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
      setError(mapWebResponseError(response.status, "환불 요청을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
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

  function openRefundConfirmation(request: RefundRequestRow) {
    const payment = paymentOf(request);
    const amount = request.refund_type === "full" ? payment.amount ?? 0 : request.amount_krw ?? 0;
    if (!Number.isInteger(amount) || amount <= 0) {
      setError("환불 금액을 확인할 수 없어 작업을 시작할 수 없습니다.");
      return;
    }

    const existingActionKey = metadataString(request, "adminActionKey");
    const recheckOnly = request.status === "processing" || request.status === "approved";
    if (recheckOnly && !isUuid(existingActionKey)) {
      setError("기존 환불 작업 식별자를 찾지 못했습니다. 운영 로그와 감사 영수증을 확인해 주세요.");
      return;
    }

    const adminNote = recheckOnly
      ? metadataString(request, "adminNote") || ""
      : adminNotes[request.id] || "";
    setError(null);
    setConfirmationText("");
    setPendingAction({
      request,
      actionKey: recheckOnly && existingActionKey ? existingActionKey : crypto.randomUUID(),
      amount,
      adminNote,
      recheckOnly,
    });
  }

  async function executeRefundAction() {
    if (!pendingAction) return;

    const { request, actionKey, amount, adminNote } = pendingAction;
    setBusyId(request.id);
    setError(null);

    const response = await fetch(`/api/admin/payments/refunds/${encodeURIComponent(request.id)}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actionKey,
        expectedStatus: request.status,
        expectedAmount: amount,
        adminNote,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as RefundMutationResponse;
    if (data.receipt && data.outcome) {
      setActionNotice({
        outcome: data.outcome,
        receipt: data.receipt,
        message:
          data.outcome === "provider_pending"
            ? "환불 상태 반영을 기다리고 있습니다. 감사 영수증의 다음 조치를 확인해 주세요."
            : "환불 작업 상태를 감사 영수증에 기록했습니다.",
      });
    }

    if (!response.ok) {
      setError(mapWebResponseError(response.status, "환불 승인에 실패했습니다. 작업 영수증을 확인한 뒤 다시 시도해 주세요."));
    }

    setPendingAction(null);
    setConfirmationText("");
    setBusyId(null);
    await loadRefunds();
  }

  const requiredConfirmation = pendingAction?.recheckOnly
    ? "상태 재조회"
    : "환불 승인";

  return (
    <div className="space-y-4 pb-10">
      <header className="rounded-2xl border border-stone-200 bg-white p-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">환불 관리</p>
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
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      {actionNotice ? (
        <div
          aria-live={actionNotice.outcome === "failed" || actionNotice.outcome === "conflict" ? "assertive" : "polite"}
          className={`rounded-xl border px-4 py-3 text-sm ${noticeTone(actionNotice.outcome)}`}
          role={actionNotice.outcome === "failed" || actionNotice.outcome === "conflict" ? "alert" : "status"}
        >
          <p className="font-black">{outcomeLabel(actionNotice.outcome)}</p>
          <p className="mt-1">{actionNotice.message}</p>
          <p className="mt-1 break-all text-xs opacity-80">
            감사 영수증 {actionNotice.receipt.id} · 처리 시각 {formatDate(actionNotice.receipt.completed_at || actionNotice.receipt.updated_at)}
          </p>
          {actionNotice.receipt.external_reference ? (
            <p className="mt-1 break-all text-xs opacity-80">
              외부 취소 ID {actionNotice.receipt.external_reference}
            </p>
          ) : null}
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
          const canAct =
            request.status === "pending" || request.status === "manual_review_required" ||
            ((request.status === "processing" || request.status === "approved") &&
              isUuid(metadataString(request, "adminActionKey")));
          const recheckOnly = request.status === "processing" || request.status === "approved";

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
                  {request.policy_version ? (
                    <div className="mt-3 grid gap-1 rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600">
                      <p><strong>처리 방식</strong> {request.decision || "manual"} · {request.outcome_choice || "-"}</p>
                      <p><strong>사유 분류</strong> {request.reason_category || "other"}</p>
                      <p><strong>크레딧</strong> 지급 {request.credits_granted ?? 0} · 잔여 {request.credits_remaining ?? 0} · 회수 {request.credits_to_claw_back ?? 0} · 보존 {request.preserved_credits ?? 0}</p>
                      <p><strong>공급자 취소 가능액</strong> {formatKrw(request.provider_cancellable_amount_krw)}</p>
                      {request.risk_codes?.length ? <p><strong>위험 코드</strong> {request.risk_codes.join(", ")}</p> : null}
                      {request.support_case_id ? <p className="break-all"><strong>비공개 지원 사례</strong> {request.support_case_id}</p> : null}
                    </div>
                  ) : null}
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
                    value={recheckOnly ? metadataString(request, "adminNote") || "" : adminNotes[request.id] || ""}
                    onChange={(event) =>
                      setAdminNotes((current) => ({ ...current, [request.id]: event.target.value }))
                    }
                    rows={3}
                    placeholder="관리자 메모"
                    disabled={!canAct || recheckOnly || busyId === request.id}
                    className="min-h-20 rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-900 disabled:bg-stone-50"
                  />
                  <Button
                    type="button"
                    disabled={!canAct || busyId === request.id}
                    onClick={() => openRefundConfirmation(request)}
                    className="h-10 rounded-lg px-3 text-xs"
                  >
                    {busyId === request.id
                      ? "처리 중"
                      : recheckOnly
                        ? "외부 상태 재조회"
                        : request.refund_type === "full"
                          ? "전액 환불 승인"
                          : "차등 환불 승인"}
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <ConfirmActionDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open && !busyId) {
            setPendingAction(null);
            setConfirmationText("");
          }
        }}
        onConfirm={() => void executeRefundAction()}
        title={pendingAction?.recheckOnly ? "외부 환불 상태 재조회" : "환불 승인 최종 확인"}
        description={
          pendingAction?.recheckOnly
            ? "동일 작업키로 PortOne 상태만 다시 조회합니다. 결제 취소 요청을 다시 보내지 않습니다."
            : pendingAction?.request.refund_type === "full"
              ? "승인 후 PortOne 결제가 취소되고 내부 크레딧과 구독 상태가 정산됩니다. 이 작업은 되돌릴 수 없습니다."
              : "승인한 차등 환불액만 PortOne에서 취소하고 해당 결제분 잔여 크레딧을 정산합니다."
        }
        target={
          pendingAction
            ? `사용자 ${pendingAction.request.user_id} · 거래 ${pendingAction.request.payment_transaction_id}`
            : null
        }
        beforeValue={
          pendingAction
            ? `${statusLabels[pendingAction.request.status]} · ${formatKrw(pendingAction.amount)}`
            : null
        }
        afterValue={
          pendingAction
            ? pendingAction.recheckOnly
              ? "PortOne 최신 상태와 내부 최종화 상태 확인"
              : pendingAction.request.refund_type === "full"
                ? `전액 환불 ${formatKrw(pendingAction.amount)}`
                : `차등 환불 ${formatKrw(pendingAction.amount)}`
            : null
        }
        tone="danger"
        confirmLabel={pendingAction?.recheckOnly ? "상태 재조회" : "환불 작업 실행"}
        pendingLabel="환불 상태 기록 중…"
        isPending={busyId !== null}
        confirmDisabled={confirmationText !== requiredConfirmation}
        confirmationSlot={
          pendingAction ? (
            <label className="grid gap-2 text-sm font-semibold text-stone-800">
              계속하려면 <strong>{requiredConfirmation}</strong>을 입력하세요.
              <input
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
                autoComplete="off"
                className="h-10 rounded-lg border border-stone-300 px-3 outline-none focus:border-stone-900"
                aria-label={`${requiredConfirmation} 확인 문구`}
              />
              <span className="text-xs font-medium text-stone-500">
                요청 사유: {pendingAction.request.reason}
                {pendingAction.adminNote ? ` · 관리자 메모: ${pendingAction.adminNote}` : ""}
              </span>
            </label>
          ) : null
        }
      />
    </div>
  );
}
