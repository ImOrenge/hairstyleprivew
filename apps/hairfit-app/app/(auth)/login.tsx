import { useSSO, useSignIn } from "@clerk/clerk-expo";
import * as AuthSession from "expo-auth-session";
import { useRouter } from "expo-router";
import { useState } from "react";
import { BodyText, Button, Heading, Kicker, Panel, Screen, Stack, TextField } from "@hairfit/ui-native";

const oauthRedirectUrl = AuthSession.makeRedirectUri({ path: "login" });

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "errors" in error) {
    const first = (error as { errors?: Array<{ message?: string }> }).errors?.[0]?.message;
    if (first) return first;
  }
  return "로그인에 실패했습니다.";
}

export default function LoginScreen() {
  const router = useRouter();
  const { isLoaded, signIn, setActive } = useSignIn();
  const { startSSOFlow } = useSSO();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    if (!isLoaded || pending) return;
    setPending(true);
    setMessage(null);

    try {
      const result = await signIn.create({
        identifier: email.trim(),
        password,
      });

      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        router.replace("/");
        return;
      }

      setMessage("추가 인증 단계가 필요합니다. 웹 로그인에서 인증을 완료한 뒤 다시 시도해 주세요.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setPending(false);
    }
  };

  const signInWithGoogle = async () => {
    if (googlePending) return;
    setGooglePending(true);
    setMessage(null);

    try {
      const result = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: oauthRedirectUrl,
      });

      if (result.createdSessionId && result.setActive) {
        await result.setActive({ session: result.createdSessionId });
        router.replace("/");
        return;
      }

      setMessage("Google 로그인 창이 닫혀 세션이 생성되지 않았습니다.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setGooglePending(false);
    }
  };

  return (
    <Screen>
      <Stack>
        <Kicker>Login</Kicker>
        <Heading>HairFit에 로그인</Heading>
        <BodyText>웹에서 사용하는 같은 계정으로 로그인하면 모바일에서도 헤어 생성 기록과 스타일 추천을 이어서 확인할 수 있습니다.</BodyText>
      </Stack>

      <Panel>
        <Stack>
          <Button disabled={googlePending || pending} variant="secondary" onPress={signInWithGoogle}>
            {googlePending ? "Google 로그인 창 여는 중..." : "Google로 계속하기"}
          </Button>
          <TextField
            autoCapitalize="none"
            keyboardType="email-address"
            label="이메일"
            onChangeText={setEmail}
            placeholder="you@example.com"
            value={email}
          />
          <TextField
            label="비밀번호"
            onChangeText={setPassword}
            placeholder="비밀번호"
            secureTextEntry
            value={password}
          />
          {message ? <BodyText>{message}</BodyText> : null}
          <Button disabled={!email.trim() || !password || pending} onPress={submit}>
            {pending ? "로그인 중..." : "로그인"}
          </Button>
          <Button variant="secondary" onPress={() => router.push("/signup")}>
            회원가입
          </Button>
        </Stack>
      </Panel>
    </Screen>
  );
}
