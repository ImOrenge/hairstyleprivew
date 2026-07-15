import { BodyText, Button, Heading, Kicker, Panel, Screen, Stack } from "@hairfit/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useHairfitApi } from "../../lib/api";

export default function PaymentCompleteScreen() {
  const api = useHairfitApi();
  const router = useRouter();
  const { paymentId } = useLocalSearchParams<{ paymentId?: string }>();
  const [message, setMessage] = useState("Verifying payment...");

  useEffect(() => {
    let cancelled = false;
    const id = typeof paymentId === "string" ? paymentId : "";

    async function verify() {
      if (!id) {
        setMessage("Missing payment ID.");
        return;
      }

      try {
        const result = await api.completeMobilePayment(id);
        if (!cancelled) {
          setMessage(`서비스 이용량 ${result.creditsGranted.toLocaleString("ko-KR")}이 지급되었습니다.`);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Payment verification failed.");
        }
      }
    }

    void verify();
    return () => {
      cancelled = true;
    };
  }, [api, paymentId]);

  return (
    <Screen>
      <Stack>
        <Kicker>Payment</Kicker>
        <Heading>Payment verification</Heading>
        <BodyText>{message}</BodyText>
      </Stack>

      <Panel>
        <Button onPress={() => router.replace("/mypage")}>Back to my page</Button>
      </Panel>
    </Screen>
  );
}
