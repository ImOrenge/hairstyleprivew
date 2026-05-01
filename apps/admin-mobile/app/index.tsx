import { useAuth } from "@clerk/clerk-expo";
import type { MobileDashboard } from "@hairfit/shared";
import { BodyText, Button, Card, Heading, Kicker, Panel, Screen, Stack, Stat } from "@hairfit/ui-native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useHairfitApi } from "../lib/api";

export default function AdminHomeScreen() {
  const router = useRouter();
  const api = useHairfitApi();
  const { isLoaded, isSignedIn } = useAuth();
  const [dashboard, setDashboard] = useState<Extract<MobileDashboard, { service: "admin" }> | null>(null);
  const [message, setMessage] = useState("Loading admin dashboard...");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isLoaded) return;
      if (!isSignedIn) {
        setMessage("Sign in with an admin account to load operations data.");
        return;
      }

      try {
        const result = await api.getMobileDashboard("admin");
        if (!cancelled && result.service === "admin") {
          setDashboard(result);
          setMessage("Admin dashboard loaded.");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Failed to load admin dashboard.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, isLoaded, isSignedIn]);

  const kpis = dashboard?.admin.kpis;

  return (
    <Screen>
      <Stack>
        <Kicker>HairFit Admin</Kicker>
        <Heading>Mobile operations overview</Heading>
        <BodyText>{message}</BodyText>
      </Stack>

      <Panel>
        <Stack>
          {kpis ? (
            <>
              <Stat label="New users" value={kpis.newUsers} />
              <Stat label="Paid orders" value={kpis.paidOrders} />
              <Stat label="Revenue KRW" value={kpis.revenueKrw.toLocaleString("ko-KR")} />
              <Stat label="Completed generations" value={kpis.generationsCompleted} />
            </>
          ) : (
            <Card>
              <BodyText>Admin KPIs will appear here after auth succeeds.</BodyText>
            </Card>
          )}
          <Button onPress={() => router.push("/stats")}>Open stats</Button>
        </Stack>
      </Panel>
    </Screen>
  );
}
