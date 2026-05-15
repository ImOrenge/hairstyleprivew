import { useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { BodyText, Button, Card, Heading, Kicker, Panel, Screen, Stack, TextField } from "@hairfit/ui-native";
import { useHairfitApi } from "../lib/api";

const targetOptions = [
  { value: "male", label: "남성" },
  { value: "female", label: "여성" },
] as const;
const toneOptions = ["natural", "trendy", "soft", "bold"] as const;

type StyleTarget = (typeof targetOptions)[number]["value"];
type StyleTone = (typeof toneOptions)[number];

export default function OnboardingScreen() {
  const api = useHairfitApi();
  const router = useRouter();
  const { user } = useUser();
  const [displayName, setDisplayName] = useState(user?.fullName || user?.firstName || "");
  const [styleTarget, setStyleTarget] = useState<StyleTarget | null>(null);
  const [preferredStyleTone, setPreferredStyleTone] = useState<StyleTone>("natural");
  const [isLoading, setIsLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadOnboardingStatus() {
      setIsLoading(true);
      setMessage(null);

      try {
        const status = await api.getOnboardingStatus();
        if (!active) {
          return;
        }

        if (status.onboardingComplete) {
          router.replace("/");
          return;
        }

        if (status.memberProfile) {
          setDisplayName((current) => status.memberProfile?.displayName || current);
          setStyleTarget(status.memberProfile.styleTarget || null);
          setPreferredStyleTone(status.memberProfile.preferredStyleTone || "natural");
        }

        if (status.degraded) {
          setMessage("Account status is partially unavailable. You can still complete setup.");
        }
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Failed to load onboarding status.");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadOnboardingStatus();

    return () => {
      active = false;
    };
  }, [api, router]);

  const submit = async () => {
    if (!displayName.trim() || !styleTarget || pending) return;
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

  if (isLoading) {
    return (
      <Screen>
        <Panel>
          <BodyText>Preparing account setup...</BodyText>
        </Panel>
      </Screen>
    );
  }

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
              <Kicker>성별</Kicker>
              {targetOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={styleTarget === option.value ? "primary" : "secondary"}
                  onPress={() => setStyleTarget(option.value)}
                >
                  {option.label}
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
          <Button disabled={!displayName.trim() || !styleTarget || pending} onPress={submit}>
            {pending ? "Saving..." : "Save and continue"}
          </Button>
        </Stack>
      </Panel>
    </Screen>
  );
}
