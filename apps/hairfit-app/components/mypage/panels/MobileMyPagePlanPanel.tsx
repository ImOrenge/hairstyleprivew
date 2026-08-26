import { useRouter } from "expo-router";
import { Linking, StyleSheet } from "react-native";
import type { MobilePlanBenefitSummary } from "@hairfit/shared";
import { BodyText, Button, Card, Heading, Panel, Stack } from "@hairfit/ui-native";
import {
  formatMobileMyPageDate as formatDate,
  formatMobileMyPageKrw as formatKrw,
  type MobileCustomerDashboard,
} from "../../../lib/mypage";
import { MobileMyPageAsyncBoundary } from "../MobileMyPageAsyncBoundary";
import { MobileRefundInterviewFlow } from "../MobileRefundInterviewFlow";

export function MobileMyPagePlanPanel({
  activePlan,
  billingPlanBenefits,
  planKey,
  payments,
  refundRequests,
}: {
  activePlan: string;
  billingPlanBenefits: MobilePlanBenefitSummary[];
  planKey: string | null;
  payments: MobileCustomerDashboard["customer"]["recentPayments"];
  refundRequests: MobileCustomerDashboard["customer"]["recentRefundRequests"];
}) {
  const router = useRouter();
  const currentPlanBenefit = billingPlanBenefits.find((benefit) => benefit.key === planKey) ?? null;

  return (
    <MobileMyPageAsyncBoundary>
      <Panel>
      <Stack>
        <Heading style={styles.panelHeading}>플랜 및 결제</Heading>
        <BodyText>현재 플랜과 최근 결제 내역입니다.</BodyText>
        <Card>
          <BodyText>활성 플랜</BodyText>
          <Heading>{activePlan}</Heading>
          <BodyText>플랜별 이용 혜택을 기준으로 서비스를 사용할 수 있습니다.</BodyText>
        </Card>
        {currentPlanBenefit ? (
          <Card>
            <BodyText>현재 플랜 혜택</BodyText>
            <BodyText>
              헤어 {currentPlanBenefit.hairOnlyCount.toLocaleString("ko-KR")}회 · 패션 {currentPlanBenefit.hairFashionSetCount.toLocaleString("ko-KR")}세트
            </BodyText>
            <BodyText>
              케어 {currentPlanBenefit.aftercareProgramCount.toLocaleString("ko-KR")}회
              {currentPlanBenefit.firstAftercareProgramFree ? " · 첫 1회 무료" : ""}
            </BodyText>
            <BodyText>
              이용 기간 {currentPlanBenefit.retentionDays === null ? "영구 보관" : `${currentPlanBenefit.retentionDays.toLocaleString("ko-KR")}일 보관`}
            </BodyText>
          </Card>
        ) : null}
        <Button onPress={() => router.push("/billing")}>플랜 변경</Button>
        {payments.length === 0 ? (
          <Card style={{ borderStyle: "dashed" }}>
            <BodyText>결제 기록이 없습니다.</BodyText>
          </Card>
        ) : (
          payments.map((payment) => {
            const refundRequest = refundRequests.find((request) => request.paymentTransactionId === payment.id);
            return <Card key={payment.id}>
              <BodyText style={styles.strongText}>{formatKrw(payment.amountKrw)}</BodyText>
              <BodyText>
                {payment.status} / 결제 이용권
              </BodyText>
              <BodyText>{formatDate(payment.paidAt ?? payment.createdAt)}</BodyText>
              {payment.provider === "google_play" ? (
                <BodyText>Google Play 결제{payment.productKey ? ` · ${payment.productKey}` : ""}</BodyText>
              ) : null}
              {refundRequest ? (
                <BodyText>환불 상태: {refundRequest.status} · {formatKrw(refundRequest.refundAmountKrw)}</BodyText>
              ) : payment.status === "paid" && payment.provider !== "google_play" ? (
                <MobileRefundInterviewFlow paymentTransactionId={payment.id} />
              ) : payment.status === "paid" && payment.provider === "google_play" ? (
                <Stack gap={8}>
                  {!payment.productKey?.startsWith("usage") ? (
                    <Button
                      variant="secondary"
                      onPress={() => void Linking.openURL("https://play.google.com/store/account/subscriptions?package=com.hairfit.app")}
                    >
                      Google Play에서 구독 관리
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    onPress={() => void Linking.openURL("https://hairfit.beauty/support")}
                  >
                    결제 지원 문의
                  </Button>
                </Stack>
              ) : null}
            </Card>;
          })
        )}
      </Stack>
      </Panel>
    </MobileMyPageAsyncBoundary>
  );
}

const styles = StyleSheet.create({
  panelHeading: {
    fontSize: 22,
    lineHeight: 28,
  },
  strongText: {
    color: "#f4f1e8",
    fontWeight: "800",
  },
});
