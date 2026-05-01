import { useAuth } from "@clerk/clerk-expo";
import type { MobileDashboard } from "@hairfit/shared";
import { BodyText, Button, Card, Heading, Kicker, Panel, Screen, Stack, Stat } from "@hairfit/ui-native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useHairfitApi } from "../lib/api";

export default function SalonHomeScreen() {
  const router = useRouter();
  const api = useHairfitApi();
  const { isLoaded, isSignedIn } = useAuth();
  const [dashboard, setDashboard] = useState<Extract<MobileDashboard, { service: "salon" }> | null>(null);
  const [message, setMessage] = useState("Loading salon dashboard...");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isLoaded) return;
      if (!isSignedIn) {
        setMessage("Sign in with a salon owner account to load CRM data.");
        return;
      }

      try {
        const result = await api.getMobileDashboard("salon");
        if (!cancelled && result.service === "salon") {
          setDashboard(result);
          setMessage("Salon dashboard loaded.");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Failed to load salon dashboard.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, isLoaded, isSignedIn]);

  const summary = dashboard?.salon.summary;

  return (
    <Screen>
      <Stack>
        <Kicker>HairFit Salon</Kicker>
        <Heading>Mobile CRM overview</Heading>
        <BodyText>{message}</BodyText>
      </Stack>

      <Panel>
        <Stack>
          {summary ? (
            <>
              <Stat label="Customers" value={summary.totalCustomers} />
              <Stat label="Linked members" value={summary.linkedMembers} />
              <Stat label="Pending aftercare" value={summary.pendingAftercare} />
              <Stat label="Due today" value={summary.dueToday} />
            </>
          ) : (
            <Card>
              <BodyText>Salon data will appear here after auth succeeds.</BodyText>
            </Card>
          )}
          <Button onPress={() => router.push("/customers")}>Open customers</Button>
        </Stack>
      </Panel>
    </Screen>
  );
}
