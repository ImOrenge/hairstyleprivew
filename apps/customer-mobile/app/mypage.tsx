import { useAuth } from "@clerk/clerk-expo";
import type { MobileDashboard } from "@hairfit/shared";
import { BodyText, Button, Card, Heading, Kicker, Panel, Screen, Stack, Stat } from "@hairfit/ui-native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useHairfitApi } from "../lib/api";

function formatKrw(value: number) {
  return `${value.toLocaleString("ko-KR")} KRW`;
}

export default function MyPageScreen() {
  const api = useHairfitApi();
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [dashboard, setDashboard] = useState<Extract<MobileDashboard, { service: "customer" }> | null>(null);
  const [message, setMessage] = useState("Loading dashboard...");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isLoaded) return;
      if (!isSignedIn) {
        setMessage("Sign in to view your dashboard.");
        return;
      }

      try {
        const result = await api.getMobileDashboard("customer");
        if (!cancelled && result.service === "customer") {
          setDashboard(result);
          setMessage("Dashboard loaded.");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Failed to load dashboard.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, isLoaded, isSignedIn]);

  const customer = dashboard?.customer;

  return (
    <Screen>
      <Stack>
        <Kicker>My Page</Kicker>
        <Heading>Credits, plans, and history</Heading>
        <BodyText>{message}</BodyText>
      </Stack>

      <Panel>
        <Stack>
          {customer ? (
            <Stack>
              <Stat label="Credits" value={customer.credits.toLocaleString("ko-KR")} />
              <Stat label="Plan" value={customer.planKey || "free"} />
            </Stack>
          ) : null}

          <Button onPress={() => router.push("/billing")}>Buy credits with PortOne</Button>
          <Button variant="secondary" onPress={() => router.push("/upload")}>Create new hairstyle</Button>
        </Stack>
      </Panel>

      {customer?.recentGenerations.length ? (
        <Panel>
          <Stack>
            <Kicker>Recent generations</Kicker>
            {customer.recentGenerations.map((item) => (
              <Card key={item.id}>
                <Stack gap={10}>
                  <Heading>{item.selectedVariantLabel || item.status}</Heading>
                  <BodyText>{item.promptUsed || "No prompt recorded"}</BodyText>
                  <Button variant="secondary" onPress={() => router.push(`/result/${item.id}`)}>Open result</Button>
                </Stack>
              </Card>
            ))}
          </Stack>
        </Panel>
      ) : null}

      {customer?.recentPayments.length ? (
        <Panel>
          <Stack>
            <Kicker>Recent payments</Kicker>
            {customer.recentPayments.map((item) => (
              <Card key={item.id}>
                <BodyText>
                  {item.status} · {formatKrw(item.amountKrw)} · {item.creditsToGrant.toLocaleString("ko-KR")} credits
                </BodyText>
              </Card>
            ))}
          </Stack>
        </Panel>
      ) : null}
    </Screen>
  );
}
