import { useClerk } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { BodyText, Heading, Panel, Screen, Stack } from "@hairfit/ui-native";

export default function SsoCallbackScreen() {
  const clerk = useClerk();
  const router = useRouter();
  const [message, setMessage] = useState("외부 인증을 완료하는 중입니다.");

  useEffect(() => {
    void clerk
      .handleRedirectCallback(
        {
          signInUrl: "/login",
          signUpUrl: "/signup",
          signInFallbackRedirectUrl: "/",
          signInForceRedirectUrl: "/",
          signUpFallbackRedirectUrl: "/onboarding",
          signUpForceRedirectUrl: "/onboarding",
          continueSignUpUrl: "/onboarding",
        },
        async (to) => {
          router.replace(to);
        },
      )
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : "외부 인증 콜백 처리에 실패했습니다.";
        setMessage(errorMessage);
      });
  }, [clerk, router]);

  return (
    <Screen>
      <Panel>
        <Stack>
          <Heading>인증 확인</Heading>
          <BodyText>{message}</BodyText>
        </Stack>
      </Panel>
    </Screen>
  );
}
