import { useRouter } from "expo-router";
import { Linking, StyleSheet } from "react-native";
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
  credits,
  payments,
  refundRequests,
}: {
  activePlan: string;
  credits: number;
  payments: MobileCustomerDashboard["customer"]["recentPayments"];
  refundRequests: MobileCustomerDashboard["customer"]["recentRefundRequests"];
}) {
  const router = useRouter();

  return (
    <MobileMyPageAsyncBoundary>
      <Panel>
      <Stack>
        <Heading style={styles.panelHeading}>플랜 및 결제</Heading>
        <BodyText>현재 플랜과 최근 결제 내역입니다.</BodyText>
        <Card>
          <BodyText>활성 플랜</BodyText>
          <Heading>{activePlan}</Heading>
          <BodyText>현재 잔액 {credits.toLocaleString("ko-KR")}크레딧</BodyText>
        </Card>
        <Button onPress={() => router.push("/billing")}>플랜 및 크레딧 충전 보기</Button>
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
                {payment.status} / {payment.creditsToGrant.toLocaleString("ko-KR")} 크레딧
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
