import { BodyText, Button, Card, Heading, Kicker, Panel, Screen, Stack } from "@hairfit/ui-native";
import { useRouter } from "expo-router";

const steps = ["Load body profile", "Choose occasion", "Request styling recommendation", "Review lookbook result"];

export default function NewStylerScreen() {
  const router = useRouter();

  return (
    <Screen>
      <Stack>
        <Kicker>Fashion Styler</Kicker>
        <Heading>Fashion flow staging</Heading>
        <BodyText>
          The customer hair flow is now live. Fashion styling remains mapped for the next mobile iteration.
        </BodyText>
      </Stack>

      <Panel>
        <Stack>
          {steps.map((step, index) => (
            <Card key={step}>
              <Kicker>{`Step ${index + 1}`}</Kicker>
              <BodyText>{step}</BodyText>
            </Card>
          ))}
          <Button onPress={() => router.push("/mypage")}>Back to my page</Button>
        </Stack>
      </Panel>
    </Screen>
  );
}
