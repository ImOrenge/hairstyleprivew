import type { PlanDisplayBenefit } from "../../lib/plan-benefit-display";
import type { PersonalColorResult } from "../../lib/fashion-types";
import { isPendingConfirmationSubscription } from "./myPagePlanSelectors";
import {
  getSafePaymentFailureCopy,
  getSafeRefundFailureCopy,
  getSafeSubscriptionFailureCopy,
} from "./myPageSafeCopy";
import type {
  HairRecordRow,
  PaymentTransactionRow,
  RefundRequestRow,
  SubscriptionRow,
} from "./myPageTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getMetadataString(metadata: unknown, key: string): string | null {
  if (!isRecord(metadata)) return null;
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function formatMyPagePlanLabel(planKey: string | null): string {
  if (!planKey) return "무료";
  if (planKey === "starter") return "스타터";
  if (planKey === "basic") return "베이직";
  if (planKey === "standard") return "스탠다드";
  if (planKey === "pro") return "프로";
  if (planKey === "salon") return "살롱";
  return "플랜 정보 확인 필요";
}

export function formatMyPageDate(value: string | null | undefined): string {
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

export function formatMyPageDay(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatMyPageKrw(value: number | null | undefined): string {
  return `${Math.max(0, value ?? 0).toLocaleString("ko-KR")} KRW`;
}

export function formatSubscriptionStatus(subscription: SubscriptionRow | null) {
  const status = subscription?.status?.trim().toLowerCase();
  if (!status) return "구독 없음";
  if (isPendingConfirmationSubscription(subscription)) return "결제 확인 중";
  if (subscription?.cancel_at_period_end) return "해지 예약";
  if (status === "active") return "활성";
  if (status === "trialing") return "체험";
  if (status === "past_due") return "결제 실패";
  if (status === "canceled") return "해지";
  if (status === "expired") return "만료";
  return "상태 확인 필요";
}

export function getSubscriptionStatusTone(subscription: SubscriptionRow | null) {
  const status = subscription?.status?.trim().toLowerCase();
  if (
    isPendingConfirmationSubscription(subscription) ||
    subscription?.cancel_at_period_end
  ) {
    return "bg-amber-50 text-amber-800 ring-1 ring-amber-200";
  }
  if (status === "active" || status === "trialing") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }
  if (status === "past_due") {
    return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
  }
  return "bg-[var(--app-surface-muted)] text-[var(--app-text)] ring-1 ring-stone-200";
}

export function formatPaymentStatus(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase();
  if (!normalized) return "상태 없음";
  if (normalized === "pending") return "결제 대기";
  if (normalized === "paid") return "결제 완료";
  if (normalized === "failed") return "결제 실패";
  if (normalized === "canceled") return "취소";
  if (normalized === "refunded") return "환불";
  return "결제 상태 확인 필요";
}

export function getPaymentStatusTone(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase();
  if (normalized === "paid") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }
  if (normalized === "failed") {
    return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
  }
  if (normalized === "canceled" || normalized === "refunded") {
    return "bg-amber-50 text-amber-800 ring-1 ring-amber-200";
  }
  return "bg-[var(--app-surface-muted)] text-[var(--app-text)] ring-1 ring-stone-200";
}

export function getPaymentFailureText(payment: PaymentTransactionRow | null) {
  if (!payment) return null;
  const code =
    payment.failure_code?.trim() ||
    getMetadataString(payment.metadata, "failureCode") ||
    "";
  const hasFailure = Boolean(
    payment.failure_message?.trim() ||
    getMetadataString(payment.metadata, "failureMessage") ||
    getMetadataString(payment.metadata, "failureReason") ||
    code,
  );
  return getSafePaymentFailureCopy(code, hasFailure);
}

export function formatRefundStatus(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase();
  if (!normalized) return "환불 상태 없음";
  if (normalized === "pending") return "환불 검토 중";
  if (normalized === "queued") return "자동 환불 대기";
  if (normalized === "processing") return "환불 처리 중";
  if (normalized === "cancel_pending") return "결제 취소 확인 중";
  if (normalized === "period_end_scheduled") return "다음 갱신 중단";
  if (normalized === "approved") return "환불 승인됨";
  if (normalized === "completed") return "환불 완료";
  if (normalized === "failed") return "환불 실패";
  if (normalized === "manual_review_required") return "수동 검토";
  if (normalized === "rejected") return "환불 반려";
  return "환불 상태 확인 필요";
}

export function getRefundFailureText(refundRequest: RefundRequestRow | null) {
  return getSafeRefundFailureCopy(Boolean(
    refundRequest?.failed_code?.trim() || refundRequest?.failed_message?.trim(),
  ));
}

export function getRefundStatusTone(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase();
  if (normalized === "completed") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }
  if (normalized === "failed" || normalized === "rejected") {
    return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
  }
  return "bg-amber-50 text-amber-800 ring-1 ring-amber-200";
}

export function getSubscriptionFailureText(subscription: SubscriptionRow | null) {
  if (!subscription) return null;
  const code = subscription.renewal_failure_code?.trim() || "";
  return getSafeSubscriptionFailureCopy(
    code,
    Boolean(code || subscription.renewal_failure_message?.trim()),
  );
}

export function formatGenerationPrompt(prompt: string | null | undefined) {
  const value = prompt?.trim();
  if (!value) return "제목 없는 생성 결과";
  return value.length <= 72 ? value : `${value.slice(0, 72)}...`;
}

export function formatGenerationStatus(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase();
  if (!normalized) return "상태 확인 중";
  if (normalized === "completed") return "완료";
  if (normalized === "processing" || normalized === "running") return "생성 중";
  if (normalized === "queued" || normalized === "pending") return "대기 중";
  if (normalized === "failed" || normalized === "error") return "실패";
  return "상태 확인 중";
}

export function getGenerationStatusTone(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase();
  if (normalized === "completed") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }
  if (normalized === "failed" || normalized === "error") {
    return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
  }
  if (normalized === "processing" || normalized === "running") {
    return "bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)] ring-1 ring-[var(--app-accent)]";
  }
  return "bg-[var(--app-surface-muted)] text-[var(--app-text)] ring-1 ring-stone-200";
}

export function getDisplayName(
  name: string | null | undefined,
  email: string,
) {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  const emailName = email.split("@")[0]?.trim();
  return emailName || "HairFit 사용자";
}

export function formatPersonalColor(result: PersonalColorResult | null) {
  if (!result) return "미진단";
  const tone =
    result.tone === "warm"
      ? "웜톤"
      : result.tone === "cool"
        ? "쿨톤"
        : "뉴트럴";
  const contrast =
    result.contrast === "high"
      ? "높은 대비"
      : result.contrast === "low"
        ? "낮은 대비"
        : "중간 대비";
  return `${tone} / ${contrast}`;
}

export function nextVisitDate(record: HairRecordRow) {
  if (!record.service_date || !record.next_visit_target_days) return "-";
  const date = new Date(`${record.service_date}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return "-";
  date.setDate(date.getDate() + record.next_visit_target_days);
  return formatMyPageDay(date.toISOString());
}

export function formatPlanHairFashionUsage(plan: PlanDisplayBenefit) {
  if (plan.usage.hairFashionSetCount <= 0) return "헤어+패션 세트 불가";
  if (plan.usage.hairFashionRemainderCredits > 0) {
    return `헤어+패션 약 ${plan.usage.hairFashionSetCount.toLocaleString("ko-KR")}세트 · ${plan.usage.hairFashionRemainderCredits.toLocaleString("ko-KR")}크레딧 잔여`;
  }
  return `헤어+패션 약 ${plan.usage.hairFashionSetCount.toLocaleString("ko-KR")}세트`;
}
