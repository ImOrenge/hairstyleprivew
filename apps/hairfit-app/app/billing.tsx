import { Payment } from "@portone/react-native-sdk";
import type { MobilePaymentPlan, MobilePaymentPrepareResponse } from "@hairfit/shared";
import { formatCompletedPayment, normalizePortoneSdkResponse, toPortoneSdkPaymentRequest } from "@hairfit/payments-portone";
import { BodyText, Button, Card, Heading, Kicker, Panel, Screen, Stack } from "@hairfit/ui-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useHairfitApi } from "../lib/api";

const plans: Array<{ key: MobilePaymentPlan; label: string; price: string; credits: string }> = [
  { key: "basic", label: "Basic", price: "4,900 KRW", credits: "30 credits" },
  { key: "standard", label: "Standard", price: "9,900 KRW", credits: "80 credits" },
  { key: "pro", label: "Pro", price: "19,900 KRW", credits: "200 credits" },
  { key: "salon", label: "Salon", price: "39,900 KRW", credits: "500 credits" },
];

export default function BillingScreen() {
  const api = useHairfitApi();
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<MobilePaymentPlan>("standard");
  const [prepared, setPrepared] = useState<MobilePaymentPrepareResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const prepare = async () => {
    if (pending) return;
    setPending(true);
    setMessage(null);

    try {
      const result = await api.prepareMobilePayment({
        plan: selectedPlan,
        appScheme: "hairfit",
      });
      setPrepared(result);
      setMessage("Payment sheet is ready.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to prepare payment.");
    } finally {
      setPending(false);
    }
  };

  const complete = async (paymentId: string) => {
    setPending(true);
    setMessage("Verifying payment on the server...");

    try {
      const result = await api.completeMobilePayment(paymentId);
      setMessage(formatCompletedPayment(result));
      router.replace("/mypage");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment verification failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Screen>
      <Stack>
        <Kicker>Billing</Kicker>
        <Heading>PortOne mobile payment</Heading>
        <BodyText>
          The app prepares a pending transaction, opens the PortOne native SDK flow, then verifies the payment server-side.
        </BodyText>
      </Stack>

      <Panel>
        <Stack>
          {plans.map((plan) => (
            <Card key={plan.key}>
              <Stack gap={10}>
                <Heading>{plan.label}</Heading>
                <BodyText>{plan.price} · {plan.credits}</BodyText>
                <Button
                  variant={selectedPlan === plan.key ? "primary" : "secondary"}
                  onPress={() => {
                    setSelectedPlan(plan.key);
                    setPrepared(null);
                  }}
                >
                  {selectedPlan === plan.key ? "Selected" : "Select plan"}
                </Button>
              </Stack>
            </Card>
          ))}
          <Button disabled={pending} onPress={prepare}>
            {pending ? "Preparing..." : "Prepare PortOne payment"}
          </Button>
          {message ? <BodyText>{message}</BodyText> : null}
        </Stack>
      </Panel>

      {prepared ? (
        <Panel>
          <Stack>
            <Kicker>Payment SDK</Kicker>
            <View style={styles.paymentFrame}>
              <Payment
                request={toPortoneSdkPaymentRequest(prepared) as never}
                onComplete={(response) => {
                  const normalized = normalizePortoneSdkResponse(response, prepared.paymentId);
                  void complete(normalized.paymentId);
                }}
                onError={(error) => {
                  setMessage(error.message);
                }}
              />
            </View>
          </Stack>
        </Panel>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  paymentFrame: {
    height: 560,
    overflow: "hidden",
  },
});
