import { useAuth } from "@clerk/clerk-expo";
import { BodyText, Button, Heading, Kicker, Panel, Stack } from "@hairfit/ui-native";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { AppScreen } from "../../components/app/AppScreen";
import { useSafeBackNavigation } from "../../hooks/useSafeBackNavigation";
import { useHairfitApi } from "../../lib/api";
import {
  completePendingPaymentCallback,
  type PaymentCallbackResolution,
} from "../../lib/payment-resume";

export default function PaymentCompleteScreen() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const api = useHairfitApi();
  const router = useRouter();
  const { code, message: providerMessage, paymentId } = useLocalSearchParams<{
    code?: string | string[];
    message?: string | string[];
    paymentId?: string | string[];
  }>();
  const [message, setMessage] = useState("저장된 결제 정보를 확인하고 있습니다...");
  const [messageIsError, setMessageIsError] = useState(false);
  const [showBillingAction, setShowBillingAction] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const callbackAttemptRef = useRef<{
    key: string;
    promise: Promise<PaymentCallbackResolution>;
  } | null>(null);
  const handledCallbackKeyRef = useRef<string | null>(null);
  const activeUserIdRef = useRef(userId);
  activeUserIdRef.current = userId;
  const explainBlockedBack = useCallback(() => {
    setMessage("결제 상태를 안전하게 확인하고 있습니다. 확인 결과가 표시된 뒤 이동해 주세요.");
    setMessageIsError(false);
  }, []);
  const navigateBack = useSafeBackNavigation({
    blocked: isVerifying,
    fallback: "/mypage?tab=plan",
    mode: "replace",
    onBlocked: explainBlockedBack,
  });

  useEffect(() => {
    let cancelled = false;
    if (!isLoaded) return () => {
      cancelled = true;
    };
    if (!isSignedIn || !userId) {
      setMessage("결제 상태를 확인하려면 결제를 준비한 계정으로 로그인해 주세요.");
      setMessageIsError(true);
      setShowBillingAction(true);
      setIsVerifying(false);
      return () => {
        cancelled = true;
      };
    }
    const callbackKey = JSON.stringify([
      userId,
      paymentId,
      code !== undefined,
      providerMessage !== undefined,
    ]);
    if (handledCallbackKeyRef.current === callbackKey) {
      return () => {
        cancelled = true;
      };
    }
    setIsVerifying(true);
    setShowBillingAction(false);

    const hasRawProviderError = code !== undefined || providerMessage !== undefined;
    if (callbackAttemptRef.current?.key !== callbackKey) {
      callbackAttemptRef.current = {
        key: callbackKey,
        promise: completePendingPaymentCallback({
          callbackPaymentId: paymentId,
          completePayment: (storedPaymentId) => api.completeMobilePayment(storedPaymentId),
          currentCustomerId: userId,
          hasProviderError: hasRawProviderError,
          isCustomerActive: (customerId) => activeUserIdRef.current === customerId,
        }),
      };
    }
    const attempt = callbackAttemptRef.current;

    async function verifyStoredPayment() {
      let resolution: PaymentCallbackResolution;
      try {
        resolution = await attempt.promise;
      } catch {
        if (cancelled) return;
        handledCallbackKeyRef.current = callbackKey;
        setMessage("결제 상태 확인 요청을 완료하지 못했습니다. 결제 화면에서 다시 확인해 주세요.");
        setMessageIsError(true);
        setShowBillingAction(true);
        setIsVerifying(false);
        return;
      }
      if (cancelled) return;
      handledCallbackKeyRef.current = callbackKey;
      if (resolution.kind === "paid") {
        // The safe stored target only reopens the paid-action quote screen.
        // This callback never submits a generation or another paid action.
        router.replace(resolution.payment.returnTo as Href);
        return;
      }

      setShowBillingAction(true);
      setIsVerifying(false);
      switch (resolution.kind) {
        case "missing":
          setMessage("확인할 결제 복구 정보가 없습니다. 결제 화면에서 상태를 다시 확인해 주세요.");
          setMessageIsError(true);
          break;
        case "provider_error":
          setMessage("결제창이 완료되지 않았습니다. 결제 화면에서 안전하게 상태를 다시 확인해 주세요.");
          setMessageIsError(true);
          break;
        case "callback_mismatch":
          setMessage("결제 확인 정보가 준비한 주문과 일치하지 않습니다. 결제 화면에서 상태를 다시 확인해 주세요.");
          setMessageIsError(true);
          break;
        case "account_changed":
          setMessage("결제를 준비한 계정이 변경되었습니다. 해당 계정에서 기존 결제 상태를 다시 확인해 주세요.");
          setMessageIsError(true);
          break;
        case "manual_review":
          setMessage("결제 승인 정보에 수동 확인이 필요합니다. 새 결제를 진행하지 말고 고객지원에 문의해 주세요.");
          setMessageIsError(true);
          break;
        case "pending":
          setMessage("결제가 아직 완료되지 않았습니다. 결제 화면에서 잠시 후 다시 확인해 주세요.");
          setMessageIsError(false);
          break;
        case "retryable":
          setMessage("결제사 상태를 확인하지 못했습니다. 결제 화면에서 수동으로 다시 확인해 주세요.");
          setMessageIsError(true);
          break;
        case "cancelled":
          setMessage("취소된 결제의 복구 정보를 정리했습니다.");
          setMessageIsError(false);
          break;
        case "failed":
          setMessage("완료되지 않은 결제의 복구 정보를 안전하게 정리했습니다.");
          setMessageIsError(true);
          break;
      }
    }

    void verifyStoredPayment();
    return () => {
      cancelled = true;
    };
  }, [api, code, isLoaded, isSignedIn, paymentId, providerMessage, router, userId]);

  return (
    <AppScreen>
      <Stack>
        <Kicker>결제 확인</Kicker>
        <Heading>결제 상태 확인</Heading>
        <View
          accessibilityLiveRegion={messageIsError ? "assertive" : "polite"}
          accessibilityRole={messageIsError ? "alert" : undefined}
        >
          <BodyText>{message}</BodyText>
        </View>
      </Stack>

      {showBillingAction ? (
        <Panel>
          <Button onPress={() => router.replace("/billing")}>결제 화면에서 다시 확인</Button>
          <Button variant="secondary" onPress={navigateBack}>
            마이페이지로 이동
          </Button>
        </Panel>
      ) : null}
    </AppScreen>
  );
}
