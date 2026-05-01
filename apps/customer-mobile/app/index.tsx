import { useAuth, useClerk } from "@clerk/clerk-expo";
import type { MobileBootstrap } from "@hairfit/shared";
import { BodyText, Button, Card, Heading, Kicker, Panel, Screen, Stack, Stat } from "@hairfit/ui-native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useHairfitApi } from "../lib/api";

export default function CustomerHomeScreen() {
  const router = useRouter();
  const api = useHairfitApi();
  const { signOut } = useClerk();
  const { isLoaded, isSignedIn } = useAuth();
  const [bootstrap, setBootstrap] = useState<MobileBootstrap | null>(null);
  const [message, setMessage] = useState("Loading mobile session...");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isLoaded) return;
      if (!isSignedIn) {
        setBootstrap(null);
        setMessage("Sign in to start a mobile HairFit session.");
        return;
      }

      try {
        const next = await api.getMobileMe();
        if (!cancelled) {
          setBootstrap(next);
          setMessage(next.onboardingComplete ? "Ready" : "Onboarding required");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Failed to load session.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, isLoaded, isSignedIn]);

  return (
    <Screen>
      <Stack>
        <Kicker>HairFit Mobile</Kicker>
        <Heading>Hairstyle generation on a native mobile flow</Heading>
        <BodyText>
          This app now talks to the same Clerk, Next API, Supabase, generation, and payment backend as the web app.
        </BodyText>
      </Stack>

      <Panel>
        <Stack>
          <Kicker>Session</Kicker>
          <Heading>{bootstrap?.displayName || bootstrap?.email || "Guest"}</Heading>
          <BodyText>{message}</BodyText>
          {bootstrap ? (
            <Stack gap={10}>
              <Stat label="Credits" value={bootstrap.credits.toLocaleString("ko-KR")} />
              <Stat label="Plan" value={bootstrap.planKey || "free"} />
            </Stack>
          ) : null}
          {!isSignedIn ? (
            <Button onPress={() => router.push("/login")}>Sign in</Button>
          ) : bootstrap && !bootstrap.onboardingComplete ? (
            <Button onPress={() => router.push("/onboarding")}>Complete onboarding</Button>
          ) : (
            <Button onPress={() => router.push("/upload")}>Upload portrait</Button>
          )}
          <Button variant="secondary" onPress={() => router.push("/mypage")}>Open my page</Button>
          <Button variant="secondary" onPress={() => router.push("/styler/new")}>Fashion styler</Button>
          <Button variant="secondary" onPress={() => router.push("/aftercare")}>Aftercare</Button>
          <Button variant="ghost" onPress={() => router.push("/legal/privacy")}>Privacy policy</Button>
          <Button variant="ghost" onPress={() => router.push("/legal/terms")}>Terms of service</Button>
          {isSignedIn ? (
            <Button
              variant="ghost"
              onPress={() => {
                void signOut();
              }}
            >
              Sign out
            </Button>
          ) : null}
        </Stack>
      </Panel>

      <Card>
        <Stack>
          <Kicker>Porting Status</Kicker>
          <BodyText>
            Customer auth, bootstrap, upload, recommendation creation, result selection, and payments are wired as the first
            mobile iteration.
          </BodyText>
        </Stack>
      </Card>
    </Screen>
  );
}
