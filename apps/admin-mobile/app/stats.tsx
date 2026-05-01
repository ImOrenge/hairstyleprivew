import { useAuth } from "@clerk/clerk-expo";
import type { MobileDashboard } from "@hairfit/shared";
import { BodyText, Card, Heading, Kicker, Panel, Screen, Stack, Stat } from "@hairfit/ui-native";
import { useEffect, useState } from "react";
import { useHairfitApi } from "../lib/api";

export default function AdminStatsScreen() {
  const api = useHairfitApi();
  const { isLoaded, isSignedIn } = useAuth();
  const [dashboard, setDashboard] = useState<Extract<MobileDashboard, { service: "admin" }> | null>(null);
  const [message, setMessage] = useState("Loading stats...");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isLoaded) return;
      if (!isSignedIn) {
        setMessage("Sign in with an admin account.");
        return;
      }

      try {
        const result = await api.getMobileDashboard("admin");
        if (!cancelled && result.service === "admin") {
          setDashboard(result);
          setMessage("Stats loaded.");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Failed to load stats.");
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
        <Kicker>Admin Dashboard</Kicker>
        <Heading>30-day stats</Heading>
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
              <Stat label="Reviews" value={kpis.reviewsSubmitted} />
              <Stat label="B2B leads" value={kpis.b2bLeads} />
            </>
          ) : null}
        </Stack>
      </Panel>

      {dashboard?.admin.daily.length ? (
        <Panel>
          <Stack>
            <Kicker>Daily trend</Kicker>
            {dashboard.admin.daily.slice(-7).map((day) => (
              <Card key={day.date}>
                <BodyText>
                  {day.date}: {day.newUsers} users, {day.generationsCompleted} generations, {day.revenueKrw.toLocaleString("ko-KR")} KRW
                </BodyText>
              </Card>
            ))}
          </Stack>
        </Panel>
      ) : null}
    </Screen>
  );
}
