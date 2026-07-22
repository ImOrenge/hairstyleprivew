import { useRouter } from "expo-router";
import { StyleSheet } from "react-native";
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
              {refundRequest ? (
                <BodyText>환불 상태: {refundRequest.status} · {formatKrw(refundRequest.refundAmountKrw)}</BodyText>
              ) : payment.status === "paid" ? (
                <MobileRefundInterviewFlow paymentTransactionId={payment.id} />
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
