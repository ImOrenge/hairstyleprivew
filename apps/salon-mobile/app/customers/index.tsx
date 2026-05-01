import { useAuth } from "@clerk/clerk-expo";
import type { MobileDashboard } from "@hairfit/shared";
import { BodyText, Card, Heading, Kicker, Panel, Screen, Stack } from "@hairfit/ui-native";
import { useEffect, useState } from "react";
import { useHairfitApi } from "../../lib/api";

export default function SalonCustomersScreen() {
  const api = useHairfitApi();
  const { isLoaded, isSignedIn } = useAuth();
  const [dashboard, setDashboard] = useState<Extract<MobileDashboard, { service: "salon" }> | null>(null);
  const [message, setMessage] = useState("Loading customers...");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isLoaded) return;
      if (!isSignedIn) {
        setMessage("Sign in with a salon owner account.");
        return;
      }

      try {
        const result = await api.getMobileDashboard("salon");
        if (!cancelled && result.service === "salon") {
          setDashboard(result);
          setMessage("Customers loaded.");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Failed to load customers.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, isLoaded, isSignedIn]);

  const customers = dashboard?.salon.recentCustomers || [];

  return (
    <Screen>
      <Stack>
        <Kicker>Customers</Kicker>
        <Heading>Salon customer list</Heading>
        <BodyText>{message}</BodyText>
      </Stack>

      <Panel>
        <Stack>
          {customers.length ? (
            customers.map((customer) => (
              <Card key={customer.id}>
                <Stack gap={10}>
                  <Heading>{customer.name}</Heading>
                  <BodyText>{customer.phone || customer.email || "No contact saved"}</BodyText>
                  <BodyText>Next follow-up: {customer.nextFollowUpAt || "not scheduled"}</BodyText>
                </Stack>
              </Card>
            ))
          ) : (
            <Card>
              <BodyText>No customers returned yet.</BodyText>
            </Card>
          )}
        </Stack>
      </Panel>
    </Screen>
  );
}
