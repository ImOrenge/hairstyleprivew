import { getSelfServePlanDisplayBenefits } from "../../../lib/plan-benefit-display";
import type { SubscriptionAccessMode } from "../../../lib/subscription-access";
import {
  PortoneSubscriptionButton,
  type SelfServeSubscriptionPlanKey,
} from "../../payments/PortoneSubscriptionButton";
import { AsyncBoundary } from "../../ui/AsyncBoundary";
import { Panel, SurfaceCard } from "../../ui/Surface";
import { RefundInterviewFlow } from "../RefundInterviewFlow";
import { SubscriptionCancelButton } from "../SubscriptionCancelButton";
import {
  formatMyPageDate as formatDate,
  formatMyPageDay as formatDay,
  formatMyPageKrw as formatKrw,
  formatMyPagePlanLabel as formatPlanLabel,
  formatPaymentStatus,
  formatPlanHairFashionUsage,
  formatRefundStatus,
  formatSubscriptionStatus,
  getPaymentFailureText,
  getPaymentStatusTone,
  getRefundFailureText,
  getRefundStatusTone,
  getSubscriptionFailureText,
  getSubscriptionStatusTone,
} from "../myPageFormatters";
import {
  canRequestRefund,
  canStartNewSubscription,
  isActiveSubscription,
  isCancellationScheduled,
  isPastDueSubscription,
  isPendingConfirmationSubscription,
} from "../myPagePlanSelectors";
import { MyPageSectionHeader as SectionHeader } from "../MyPageSectionHeader";
import type {
  PaymentTransactionRow,
  RefundRequestRow,
  SubscriptionRow,
} from "../myPageTypes";

export function MyPagePlanPanel({
  activePlan,
  email,
  payments,
  refundRequests,
  subscription,
  subscriptionAccessMode,
}: {
  activePlan: string;
  email: string;
  payments: PaymentTransactionRow[];
  refundRequests: RefundRequestRow[];
  subscription: SubscriptionRow | null;
  subscriptionAccessMode: SubscriptionAccessMode;
}) {
  const activeSubscription = isActiveSubscription(subscription);
  const cancellationScheduled = isCancellationScheduled(subscription);
  const pastDue = isPastDueSubscription(subscription);
  const pendingConfirmation = isPendingConfirmationSubscription(subscription);
  const allowNewSubscription = canStartNewSubscription(subscription);
  const latestFailedPayment =
    payments.find((item) => item.status?.trim().toLowerCase() === "failed") ?? null;
  const latestFailureText =
    getPaymentFailureText(latestFailedPayment) ?? getSubscriptionFailureText(subscription);
  const selfServePlans = getSelfServePlanDisplayBenefits();
  const refundRequestByPaymentId = new Map(
    refundRequests.map((item) => [item.payment_transaction_id, item]),
  );

  return (
    <AsyncBoundary>
      <Panel
      id="mypage-panel-plan"
      role="tabpanel"
      aria-labelledby="mypage-tab-plan"
      as="section"
      className="p-4 sm:p-5"
    >
      <SectionHeader title="플랜 및 결제" description="현재 플랜과 최근 결제 내역입니다." />
      <div className="mt-4 grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
        <SurfaceCard className="px-4 py-3">
          <p className="text-xs font-bold uppercase text-[var(--app-muted)]">활성 플랜</p>
          <p className="mt-2 text-2xl font-black text-[var(--app-text)]">{activePlan}</p>
          <div className="mt-3 grid gap-2 text-xs leading-5 text-[var(--app-muted)]">
            <p>
              <span className={`inline-flex rounded-[var(--app-radius-control)] px-2 py-1 text-xs font-bold ${getSubscriptionStatusTone(subscription)}`}>
                {formatSubscriptionStatus(subscription)}
              </span>
            </p>
            <p>현재 기간 종료: {formatDay(subscription?.current_period_end)}</p>
            {cancellationScheduled ? (
              <p className="font-semibold text-rose-600">
                해지 예약됨: {formatDay(subscription?.canceled_at ?? subscription?.current_period_end)}
              </p>
            ) : null}
          </div>
          {pastDue ? (
            <div className="mt-4 border border-rose-200 bg-rose-50 px-3 py-3 text-xs leading-5 text-rose-700">
              <p className="font-bold">최근 구독 결제에 실패했습니다.</p>
              <p className="mt-1">
                {latestFailureText || "카드 상태를 확인하거나 잠시 후 결제 상태를 다시 확인해 주세요."}
              </p>
              {subscription?.renewal_failure_count ? (
                <p className="mt-1">
                  실패 횟수: {subscription.renewal_failure_count.toLocaleString("ko-KR")}회
                  {subscription.renewal_next_retry_at
                    ? ` / 다음 재시도: ${formatDate(subscription.renewal_next_retry_at)}`
                    : ""}
                </p>
              ) : null}
            </div>
          ) : null}
          {pendingConfirmation ? (
            <div className="mt-4 border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800">
              <p className="font-bold">결제 확인을 기다리고 있습니다.</p>
              <p className="mt-1">
                {formatPlanLabel(subscription?.plan_key ?? null)} 플랜은 결제 확인이 끝난 뒤 활성화됩니다.
              </p>
              <p className="mt-1">
                결제가 중단된 경우 잠시 후 새로고침하세요. 상태가 계속 남아 있으면 운영 확인이 필요합니다.
              </p>
            </div>
          ) : null}
          {activeSubscription && !cancellationScheduled ? (
            <div className="mt-4">
              <SubscriptionCancelButton />
            </div>
          ) : null}

          <div className="mt-4 border-t border-[var(--app-border)] pt-4">
            <p className="text-xs font-bold uppercase text-[var(--app-muted)]">월 플랜 결제</p>
            {allowNewSubscription ? (
              <div className="mt-3 grid gap-2">
                {selfServePlans.map((plan) => (
                  <div
                    key={plan.key}
                    className="grid gap-2 border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-[var(--app-text)]">
                          {formatPlanLabel(plan.key)}
                        </p>
                        <p className="mt-1 text-xs text-[var(--app-muted)]">
                          {plan.credits.toLocaleString("ko-KR")} 크레딧 / 월
                        </p>
                        <div className="mt-2 grid gap-1 text-xs leading-5 text-[var(--app-muted)]">
                          <p>헤어 약 {plan.usage.hairOnlyCount.toLocaleString("ko-KR")}회</p>
                          <p>{formatPlanHairFashionUsage(plan)}</p>
                          <p>첫 에프터케어 프로그램 무료 · 주기별 케어 메일 포함 · 추가 {plan.creditsPerAftercareProgram.toLocaleString("ko-KR")}크레딧</p>
                          <p>생성 이미지 {plan.retentionLabelKo}</p>
                        </div>
                      </div>
                      <p className="text-right text-sm font-black text-[var(--app-text)]">
                        {formatKrw(plan.priceKrw)}
                      </p>
                    </div>
                    <PortoneSubscriptionButton
                      planKey={plan.key as SelfServeSubscriptionPlanKey}
                      initialEmail={email}
                      subscriptionAccessMode={subscriptionAccessMode}
                      variant={plan.key === "basic" ? "secondary" : "primary"}
                      className="w-full px-3 py-2 text-xs"
                      successRedirectPath="/mypage"
                    >
                      {subscriptionAccessMode === "waitlist"
                        ? "오픈 알림 신청"
                        : `${formatPlanLabel(plan.key)} 시작`}
                    </PortoneSubscriptionButton>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs leading-5 text-[var(--app-muted)]">
                {pendingConfirmation
                  ? "결제 확인 중에는 중복 구독을 새로 만들지 않습니다. 확인이 끝난 뒤 다시 시도할 수 있습니다."
                  : pastDue
                    ? "결제 실패 상태에서는 중복 구독을 새로 만들지 않습니다. 카드 상태를 확인한 뒤 결제 상태를 다시 확인해 주세요."
                    : "현재 구독이 있어 새 결제는 중복으로 진행하지 않습니다. 플랜 변경은 해지 후 기간 종료 또는 별도 변경 정책 확정 후 지원됩니다."}
              </p>
            )}
          </div>
        </SurfaceCard>

        <div className="grid gap-3">
          {payments.length === 0 ? (
            <SurfaceCard className="border-dashed px-4 py-5 text-sm text-[var(--app-muted)]">
              결제 기록이 없습니다.
            </SurfaceCard>
          ) : (
            payments.map((item) => {
              const refundRequest = refundRequestByPaymentId.get(item.id) ?? null;

              return (
              <SurfaceCard key={item.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-[var(--app-text)]">{formatKrw(item.amount)}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-[var(--app-radius-control)] px-2 py-1 text-xs font-bold ${getPaymentStatusTone(item.status)}`}>
                        {formatPaymentStatus(item.status)}
                      </span>
                      <span className="text-xs text-[var(--app-muted)]">
                        {(item.credits_to_grant ?? 0).toLocaleString("ko-KR")} 크레딧
                      </span>
                    </div>
                    {getPaymentFailureText(item) ? (
                      <p className="mt-2 text-xs leading-5 text-rose-600">{getPaymentFailureText(item)}</p>
                    ) : null}
                    {item.webhook_received_at ? (
                      <p className="mt-1 text-xs leading-5 text-[var(--app-muted)]">
                        결제 상태 확인: {formatDate(item.webhook_received_at)}
                      </p>
                    ) : null}
                    {refundRequest ? (
                      <div className="mt-3 grid gap-1 text-xs leading-5 text-[var(--app-muted)]">
                        <p>
                          <span className={`rounded-[var(--app-radius-control)] px-2 py-1 font-bold ${getRefundStatusTone(refundRequest.status)}`}>
                            {formatRefundStatus(refundRequest.status)}
                          </span>
                        </p>
                        <p>요청일: {formatDate(refundRequest.requested_at)}</p>
                        {getRefundFailureText(refundRequest) ? (
                          <p className="font-semibold text-rose-600">
                            {getRefundFailureText(refundRequest)}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {canRequestRefund(item, refundRequest) ? (
                      <RefundInterviewFlow paymentTransactionId={item.id} />
                    ) : null}
                  </div>
                  <p className="text-right text-xs text-[var(--app-muted)]">{formatDate(item.paid_at ?? item.created_at)}</p>
                </div>
              </SurfaceCard>
              );
            })
          )}
        </div>
      </div>
      </Panel>
    </AsyncBoundary>
  );
}
