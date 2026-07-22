import { useClerk } from "@clerk/clerk-expo";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { BodyText, Heading, Panel, Stack } from "@hairfit/ui-native";
import { View } from "react-native";
import { AppScreen } from "../components/app/AppScreen";
import {
  buildAuthRoute,
  parseResumeTargetParam,
  resolveAuthResumePath,
  resolveAuthResumeTarget,
} from "../lib/auth-resume";
import { mapMobileUserError } from "../lib/mobile-user-message";

export default function SsoCallbackScreen() {
  const clerk = useClerk();
  const router = useRouter();
  const { resume } = useLocalSearchParams<{ resume?: string | string[] }>();
  const [message, setMessage] = useState("외부 인증을 완료하는 중입니다.");
  const resumeParam = Array.isArray(resume) ? resume[0] : resume;

  useEffect(() => {
    let active = true;

    void (async () => {
      const target = parseResumeTargetParam(resumeParam) ?? await resolveAuthResumeTarget();
      const destination = await resolveAuthResumePath(resumeParam);

      await clerk.handleRedirectCallback(
        {
          signInUrl: buildAuthRoute("/login", target),
          signUpUrl: buildAuthRoute("/signup", target),
          signInFallbackRedirectUrl: destination,
          signUpFallbackRedirectUrl: destination,
          continueSignUpUrl: buildAuthRoute("/signup", target),
        },
        async () => {
          if (active) {
            router.replace(destination as Href);
          }
        },
      );
    })().catch((error: unknown) => {
      if (active) {
        setMessage(mapMobileUserError(error, "외부 인증을 완료하지 못했습니다. 로그인 화면에서 다시 시도해 주세요."));
      }
    });

    return () => {
      active = false;
    };
  }, [clerk, resumeParam, router]);

  return (
    <AppScreen>
      <Panel>
        <Stack>
          <Heading>인증 확인</Heading>
          <View accessibilityLiveRegion="polite">
            <BodyText>{message}</BodyText>
          </View>
        </Stack>
      </Panel>
    </AppScreen>
  );
}
