import { useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useState } from "react";
import { BodyText, Button, Card, Heading, Kicker, Panel, Screen, Stack, TextField } from "@hairfit/ui-native";
import { useHairfitApi } from "../lib/api";

const targetOptions = ["male", "female", "neutral"] as const;
const toneOptions = ["natural", "trendy", "soft", "bold"] as const;

type StyleTarget = (typeof targetOptions)[number];
type StyleTone = (typeof toneOptions)[number];

export default function OnboardingScreen() {
  const api = useHairfitApi();
  const router = useRouter();
  const { user } = useUser();
  const [displayName, setDisplayName] = useState(user?.fullName || user?.firstName || "");
  const [styleTarget, setStyleTarget] = useState<StyleTarget>("neutral");
  const [preferredStyleTone, setPreferredStyleTone] = useState<StyleTone>("natural");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    if (!displayName.trim() || pending) return;
    setPending(true);
    setMessage(null);

    try {
      await api.submitOnboarding({
        displayName,
        styleTarget,
        preferredStyleTone,
      });
      router.replace("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Onboarding failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Screen>
      <Stack>
        <Kicker>Onboarding</Kicker>
        <Heading>Set up your HairFit profile</Heading>
        <BodyText>This writes to the existing `/api/onboarding` endpoint and unlocks the mobile customer flow.</BodyText>
      </Stack>

      <Panel>
        <Stack>
          <TextField label="Display name" onChangeText={setDisplayName} placeholder="Your name" value={displayName} />

          <Card>
            <Stack gap={10}>
              <Kicker>Style target</Kicker>
              {targetOptions.map((option) => (
                <Button
                  key={option}
                  variant={styleTarget === option ? "primary" : "secondary"}
                  onPress={() => setStyleTarget(option)}
                >
                  {option}
                </Button>
              ))}
            </Stack>
          </Card>

          <Card>
            <Stack gap={10}>
              <Kicker>Preferred tone</Kicker>
              {toneOptions.map((option) => (
                <Button
                  key={option}
                  variant={preferredStyleTone === option ? "primary" : "secondary"}
                  onPress={() => setPreferredStyleTone(option)}
                >
                  {option}
                </Button>
              ))}
            </Stack>
          </Card>

          {message ? <BodyText>{message}</BodyText> : null}
          <Button disabled={!displayName.trim() || pending} onPress={submit}>
            {pending ? "Saving..." : "Save and continue"}
          </Button>
        </Stack>
      </Panel>
    </Screen>
  );
}
