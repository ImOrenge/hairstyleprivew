import { useAuth } from "@clerk/clerk-expo";
import { Payment } from "@portone/react-native-sdk";
import type {
  MobileBootstrap,
  MobileDashboard,
  MobilePaymentPlan,
  MobilePaymentPrepareResponse,
} from "@hairfit/shared";
import { SUBSCRIPTION_BILLING_POLICY_KO } from "@hairfit/shared";
import { formatCompletedPayment, normalizePortoneSdkResponse, toPortoneSdkPaymentRequest } from "@hairfit/payments-portone";
import { BodyText, Button, Card, Heading, Kicker, Panel, Stack } from "@hairfit/ui-native";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppScreen } from "../components/app/AppScreen";
import { useSafeBackNavigation } from "../hooks/useSafeBackNavigation";
import { useHairfitApi } from "../lib/api";
import {
  canStartNewMobilePayment,
  classifyPaymentCompletionError,
  isMatchingPaidCompletion,
  isPaymentAutoResumeEligible,
  normalizePaymentResumeReturnTo,
  paymentResumeStore,
  type PendingMobilePayment,
} from "../lib/payment-resume";

function formatPlanLabel(planKey: string | null | undefined) {
  if (!planKey || planKey === "free") return "Free";
  return planKey.charAt(0).toUpperCase() + planKey.slice(1);
}

export default function BillingScreen() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const api = useHairfitApi();
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const paymentReturnTo = useMemo(() => normalizePaymentResumeReturnTo(returnTo), [returnTo]);
  const [account, setAccount] = useState<MobileBootstrap | null>(null);
  const [dashboard, setDashboard] = useState<Extract<MobileDashboard, { service: "customer" }> | null>(null);
  const [snapshotPending, setSnapshotPending] = useState(true);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<MobilePaymentPlan>("standard");
  const [prepared, setPrepared] = useState<MobilePaymentPrepareResponse | null>(null);
  const [pendingPayment, setPendingPayment] = useState<PendingMobilePayment | null>(null);
  const [resumeLookupPending, setResumeLookupPending] = useState(true);
  const [resumeLookupFailed, setResumeLookupFailed] = useState(false);
  const [resumeLookupRevision, setResumeLookupRevision] = useState(0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const resumeAttemptedUserIdRef = useRef<string | null>(null);
  const completionInFlightRef = useRef<string | null>(null);
  const settledPaymentIdsRef = useRef(new Set<string>());
  const activeUserIdRef = useRef(userId);
  activeUserIdRef.current = userId;

  const showMessage = useCallback((text: string, isError = false) => {
    setMessage(text);
    setMessageIsError(isError);
  }, []);
  const closePreparedPayment = useCallback(() => {
    if (!prepared) return false;
    setPrepared(null);
    showMessage(
      "결제창을 닫았습니다. 준비한 주문은 안전하게 보존했으니 새 결제를 만들지 말고 기존 결제 상태를 확인해 주세요.",
    );
    return true;
  }, [prepared, showMessage]);
  const explainBlockedBack = useCallback(() => {
    showMessage("결제 상태를 확인하고 있습니다. 확인이 끝난 뒤 이동해 주세요.");
  }, [showMessage]);
  const navigateBack = useSafeBackNavigation({
    blocked: pending,
    fallback: paymentReturnTo as Href,
    mode: "replace",
    onBeforeNavigate: closePreparedPayment,
    onBlocked: explainBlockedBack,
  });

  const clearSettledPayment = useCallback(async (
    payment: PendingMobilePayment,
    nextMessage: string,
    isError = true,
  ) => {
    settledPaymentIdsRef.current.add(payment.paymentId);
    await paymentResumeStore.clear(payment.customerId, payment.paymentId).catch(() => false);
    setPendingPayment((current) => current?.paymentId === payment.paymentId ? null : current);
    setPrepared((current) => current?.paymentId === payment.paymentId ? null : current);
    showMessage(nextMessage, isError);
  }, [showMessage]);

  const verifyPendingPayment = useCallback(async (payment: PendingMobilePayment) => {
    if (!userId || payment.customerId !== userId) {
      setPendingPayment(null);
      setPrepared(null);
      showMessage("결제를 준비한 계정으로 다시 로그인하면 기존 결제 상태를 확인할 수 있습니다.", true);
      return;
    }
    if (
      settledPaymentIdsRef.current.has(payment.paymentId) ||
      completionInFlightRef.current !== null
    ) {
      return;
    }

    completionInFlightRef.current = payment.paymentId;
    setPendingPayment(payment);
    setSelectedPlan(payment.plan);
    setPending(true);
    showMessage("중단된 결제 상태를 다시 확인하고 있습니다...");

    try {
      const result = await api.completeMobilePayment(payment.paymentId);
      if (activeUserIdRef.current !== payment.customerId) {
        setPendingPayment(null);
        setPrepared(null);
        showMessage("결제 확인 중 계정이 변경되었습니다. 결제를 준비한 계정에서 다시 확인해 주세요.", true);
        return;
      }
      if (!isMatchingPaidCompletion(result, payment)) {
        setPrepared(null);
        setPendingPayment(payment);
        showMessage(
          "결제 승인 정보와 준비한 주문이 일치하지 않습니다. 새 결제를 진행하지 말고 고객지원에 확인해 주세요.",
          true,
        );
        return;
      }

      settledPaymentIdsRef.current.add(payment.paymentId);
      await paymentResumeStore.clear(payment.customerId, payment.paymentId).catch(() => false);
      setPendingPayment((current) => current?.paymentId === payment.paymentId ? null : current);
      setPrepared((current) => current?.paymentId === payment.paymentId ? null : current);
      showMessage(formatCompletedPayment(result));
      // Returning to /generate only reopens its quote screen. A paid action is
      // never submitted from this payment recovery path.
      router.replace(payment.returnTo as Href);
    } catch (error) {
      if (activeUserIdRef.current !== payment.customerId) {
        setPendingPayment(null);
        setPrepared(null);
        showMessage("결제 확인 중 계정이 변경되었습니다. 결제를 준비한 계정에서 다시 확인해 주세요.", true);
        return;
      }
      const failureKind = classifyPaymentCompletionError(error);
      if (
        failureKind === "pending" ||
        failureKind === "retryable" ||
        failureKind === "manual_review"
      ) {
        setPrepared(null);
        setPendingPayment(payment);
        showMessage(
          failureKind === "pending"
            ? "결제가 아직 완료되지 않았습니다. 결제사 처리가 끝난 뒤 상태를 다시 확인해 주세요."
            : failureKind === "manual_review"
              ? "결제 승인 정보에 수동 확인이 필요합니다. 새 결제를 진행하지 말고 고객지원에 문의해 주세요."
              : "결제사 상태를 확인하지 못했습니다. 새 결제를 진행하지 말고 잠시 후 다시 확인해 주세요.",
          failureKind !== "pending",
        );
      } else {
        await clearSettledPayment(
          payment,
          failureKind === "cancelled"
            ? "취소된 결제의 복구 정보를 정리했습니다. 필요하면 새 결제를 준비해 주세요."
            : "완료되지 않은 결제의 복구 정보를 정리했습니다. 필요하면 새 결제를 준비해 주세요.",
        );
      }
    } finally {
      if (completionInFlightRef.current === payment.paymentId) {
        completionInFlightRef.current = null;
      }
      setPending(false);
    }
  }, [api, clearSettledPayment, router, showMessage, userId]);

  useEffect(() => {
    let cancelled = false;

    async function loadSnapshot() {
      if (!isLoaded) return;
      if (!isSignedIn) {
        if (!cancelled) {
          setAccount(null);
          setDashboard(null);
          setSnapshotPending(false);
          setSnapshotError("결제하려면 먼저 로그인해 주세요.");
        }
        return;
      }

      setSnapshotPending(true);
      setSnapshotError(null);
      setAccount(null);
      setDashboard(null);
      const [accountResult, dashboardResult] = await Promise.allSettled([
        api.getMobileMe(),
        api.getMobileDashboard("customer"),
      ]);
      if (cancelled) return;

      if (accountResult.status === "fulfilled") {
        setAccount(accountResult.value);
      } else {
        setAccount(null);
      }

      if (dashboardResult.status === "fulfilled" && dashboardResult.value.service === "customer") {
        setDashboard(dashboardResult.value);
      } else {
        setDashboard(null);
      }

      const failures = [accountResult, dashboardResult]
        .filter((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failures.length > 0) {
        setSnapshotError("일부 계정 정보를 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 열어 주세요.");
      }
      setSnapshotPending(false);
    }

    void loadSnapshot();
    return () => {
      cancelled = true;
    };
  }, [api, isLoaded, isSignedIn, userId]);

  useEffect(() => {
    let cancelled = false;

    if (!isLoaded) return () => {
      cancelled = true;
    };
    if (!isSignedIn || !userId) {
      resumeAttemptedUserIdRef.current = null;
      setPendingPayment(null);
      setPrepared(null);
      setResumeLookupPending(false);
      setResumeLookupFailed(false);
      return () => {
        cancelled = true;
      };
    }
    if (resumeAttemptedUserIdRef.current === userId) {
      return () => {
        cancelled = true;
      };
    }

    resumeAttemptedUserIdRef.current = userId;
    setPendingPayment(null);
    setPrepared(null);
    setResumeLookupPending(true);
    setResumeLookupFailed(false);
    void paymentResumeStore.read(userId)
      .then((payment) => {
        if (cancelled || !payment) return;
        setPendingPayment(payment);
        setSelectedPlan(payment.plan);
        if (isPaymentAutoResumeEligible(payment)) {
          void verifyPendingPayment(payment);
        } else {
          showMessage(
            "기존 결제의 자동 확인 시간이 지났습니다. 새 결제를 진행하지 말고 상태를 직접 확인하거나 고객지원에 문의해 주세요.",
            true,
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResumeLookupFailed(true);
          showMessage(
            "기존 결제 정보를 확인하지 못했습니다. 새 결제를 진행하지 말고 다시 불러오거나 고객지원에 문의해 주세요.",
            true,
          );
        }
      })
      .finally(() => {
        if (!cancelled) setResumeLookupPending(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, resumeLookupRevision, showMessage, userId, verifyPendingPayment]);

  const plans = dashboard?.customer.billingPlans ?? [];
  const hasAccountSnapshot = Boolean(account || dashboard);
  const canStartNewPayment =
    !resumeLookupFailed && canStartNewMobilePayment(pendingPayment);

  const prepare = async () => {
    if (!userId || pending || resumeLookupPending || !canStartNewPayment) return;
    const currentUserId = userId;
    setPending(true);
    setMessage(null);
    setMessageIsError(false);

    try {
      const result = await api.prepareMobilePayment({
        plan: selectedPlan,
        appScheme: "hairfit",
      });
      const savedPayment = await paymentResumeStore.save(
        result,
        paymentReturnTo,
        currentUserId,
      );
      if (activeUserIdRef.current !== savedPayment.customerId) {
        throw new Error("Payment account changed while preparing checkout");
      }
      setPendingPayment(savedPayment);
      setPrepared(result);
      showMessage("결제 정보를 확인했습니다. 아래 결제창에서 계속 진행해 주세요.");
    } catch {
      showMessage(
        "결제 정보를 안전하게 준비하거나 저장하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.",
        true,
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <AppScreen>
      <Stack>
        <Kicker>플랜 결제</Kicker>
        <Heading>플랜과 크레딧 충전</Heading>
        <BodyText>
          주문 정보를 확인하고 안전한 결제창을 연 뒤, 결제 완료가 확인된 크레딧만 반영합니다.
        </BodyText>
      </Stack>

      <Panel>
        <Stack gap={10}>
          <Kicker>현재 계정</Kicker>
          {snapshotPending ? <Heading>불러오는 중</Heading> : null}
          {!snapshotPending && hasAccountSnapshot ? (
            <>
              <Heading>{formatPlanLabel(dashboard?.customer.planKey ?? account?.planKey)}</Heading>
              <BodyText>
                보유 크레딧 {(dashboard?.customer.credits ?? account?.credits)?.toLocaleString("ko-KR")}
              </BodyText>
              {dashboard?.customer.creditPolicy ? (
                <BodyText>
                  헤어 생성 {dashboard.customer.creditPolicy.hairstyleGeneration} · 패션 룩북 {dashboard.customer.creditPolicy.outfitLookbook} · 추가 에프터케어 {dashboard.customer.creditPolicy.additionalAftercareProgram}크레딧
                </BodyText>
              ) : null}
            </>
          ) : null}
          {!snapshotPending && !hasAccountSnapshot ? (
            <Heading>현재 계정 정보를 표시할 수 없습니다</Heading>
          ) : null}
          {snapshotError ? (
            <View accessibilityLiveRegion="assertive" accessibilityRole="alert">
              <BodyText>{snapshotError}</BodyText>
            </View>
          ) : null}
        </Stack>
      </Panel>

      <Card>
        <Stack gap={10}>
          <Kicker>결제 전 확인</Kicker>
          <Heading>정기결제·해지·크레딧 안내</Heading>
          {SUBSCRIPTION_BILLING_POLICY_KO.map((item) => (
            <BodyText key={item.id}>• {item.title}: {item.description}</BodyText>
          ))}
          <Button variant="secondary" onPress={() => router.push("/legal/terms")}>이용 약관 보기</Button>
          <Button variant="secondary" onPress={() => router.push("/legal/privacy")}>개인정보 처리방침 보기</Button>
        </Stack>
      </Card>

      <Panel>
        <Stack>
          {pendingPayment && !prepared ? (
            <Card>
              <Stack gap={10}>
                <Kicker>결제 상태 확인 필요</Kicker>
                <Heading>{formatPlanLabel(pendingPayment.plan)} 결제</Heading>
                <BodyText>
                  앱이 종료되기 전에 준비한 결제입니다. 유료 생성은 자동으로 시작하지 않으며,
                  결제 완료가 확인된 경우에만 이전 작업 화면으로 돌아갑니다.
                </BodyText>
                <BodyText>
                  준비 시각 {new Date(pendingPayment.createdAt).toLocaleString("ko-KR")}
                </BodyText>
                <Button
                  disabled={pending}
                  onPress={() => void verifyPendingPayment(pendingPayment)}
                >
                  {pending ? "결제 상태 확인 중..." : "결제 상태 다시 확인"}
                </Button>
                <Button variant="secondary" onPress={() => router.replace("/mypage?tab=plan")}>
                  마이페이지에서 결제 내역 보기
                </Button>
              </Stack>
            </Card>
          ) : null}
          {!snapshotPending && plans.length === 0 ? (
            <Card>
              <BodyText>결제 가능한 플랜 정보를 불러오지 못했습니다. 잠시 후 다시 열어 주세요.</BodyText>
            </Card>
          ) : null}
          {resumeLookupFailed ? (
            <Card>
              <Stack gap={10}>
                <Heading>기존 결제 정보 확인 필요</Heading>
                <BodyText>
                  중복 결제를 막기 위해 복구 확인 전에는 새 결제를 시작할 수 없습니다.
                </BodyText>
                <Button
                  disabled={resumeLookupPending}
                  onPress={() => {
                    resumeAttemptedUserIdRef.current = null;
                    setResumeLookupPending(true);
                    setResumeLookupFailed(false);
                    setResumeLookupRevision((revision) => revision + 1);
                  }}
                >
                  기존 결제 정보 다시 불러오기
                </Button>
              </Stack>
            </Card>
          ) : null}
          {plans.map((plan) => (
            <Card key={plan.key}>
              <Stack gap={10}>
                <Heading>{plan.label}</Heading>
                <BodyText>
                  월 {plan.priceKrw.toLocaleString("ko-KR")}원 · 월 {plan.credits.toLocaleString("ko-KR")}크레딧
                </BodyText>
                <Button
                  accessibilityLabel={`${plan.label} 플랜, 월 ${plan.priceKrw.toLocaleString("ko-KR")}원, 월 ${plan.credits.toLocaleString("ko-KR")}크레딧`}
                  accessibilityState={{ selected: selectedPlan === plan.key }}
                  disabled={pending || resumeLookupPending || !canStartNewPayment}
                  variant={selectedPlan === plan.key ? "primary" : "secondary"}
                  onPress={() => {
                    setSelectedPlan(plan.key);
                    setPrepared(null);
                  }}
                >
                  {selectedPlan === plan.key ? "선택됨" : "이 플랜 선택"}
                </Button>
              </Stack>
            </Card>
          ))}
          <Button
            disabled={
              pending || resumeLookupPending || !canStartNewPayment || plans.length === 0
            }
            onPress={prepare}
          >
            {resumeLookupPending
              ? "중단된 결제 확인 중..."
              : pending
                ? "결제 준비 중..."
                : "결제 정보 확인"}
          </Button>
          {message ? (
            <View
              accessibilityLiveRegion={messageIsError ? "assertive" : "polite"}
              accessibilityRole={messageIsError ? "alert" : undefined}
            >
              <BodyText>{message}</BodyText>
            </View>
          ) : null}
          <Button disabled={pending} variant="secondary" onPress={navigateBack}>
            {prepared ? "결제창 닫기" : "이전 화면으로"}
          </Button>
        </Stack>
      </Panel>

      {prepared ? (
        <Panel>
          <Stack>
            <Kicker>안전한 결제</Kicker>
            <Heading>{prepared.orderName}</Heading>
            <BodyText>
              {prepared.amountKrw.toLocaleString("ko-KR")}원 · {prepared.credits.toLocaleString("ko-KR")}크레딧
            </BodyText>
            <View style={styles.paymentFrame}>
              <Payment
                request={toPortoneSdkPaymentRequest(prepared) as never}
                onComplete={(response) => {
                  const normalized = normalizePortoneSdkResponse(response, prepared.paymentId);
                  if (normalized.status === "failed") {
                    setPrepared(null);
                    setPendingPayment(pendingPayment);
                    showMessage(
                      "결제 확인이 아직 끝나지 않았습니다. 새 결제를 진행하지 말고 결제 상태를 다시 확인해 주세요.",
                      true,
                    );
                    return;
                  }
                  if (
                    normalized.paymentId !== prepared.paymentId ||
                    pendingPayment?.paymentId !== prepared.paymentId
                  ) {
                    setPrepared(null);
                    setPendingPayment(pendingPayment);
                    showMessage(
                      "결제 정보가 준비한 주문과 일치하지 않습니다. 새 결제를 진행하지 말고 결제 상태를 다시 확인해 주세요.",
                      true,
                    );
                    return;
                  }
                  void verifyPendingPayment(pendingPayment);
                }}
                onError={() => {
                  setPrepared(null);
                  setPendingPayment(pendingPayment);
                  showMessage(
                    "결제창을 완료하지 못했습니다. 기존 주문을 보존했으니 새 결제를 진행하지 말고 결제 상태를 다시 확인해 주세요.",
                    true,
                  );
                }}
              />
            </View>
          </Stack>
        </Panel>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  paymentFrame: {
    height: 560,
    overflow: "hidden",
  },
});
