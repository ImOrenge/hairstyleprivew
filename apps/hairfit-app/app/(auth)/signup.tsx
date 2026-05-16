import { useSSO, useSignUp } from "@clerk/clerk-expo";
import * as AuthSession from "expo-auth-session";
import { useRouter } from "expo-router";
import { useState } from "react";
import { BodyText, Button, Heading, Kicker, Panel, Screen, Stack, TextField } from "@hairfit/ui-native";

const oauthRedirectUrl = AuthSession.makeRedirectUri({ path: "signup" });

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "errors" in error) {
    const first = (error as { errors?: Array<{ message?: string }> }).errors?.[0]?.message;
    if (first) return first;
  }
  return "회원가입에 실패했습니다.";
}

export default function SignupScreen() {
  const router = useRouter();
  const { isLoaded, signUp, setActive } = useSignUp();
  const { startSSOFlow } = useSSO();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const completeSession = async (sessionId: string | null | undefined) => {
    if (!sessionId || !setActive) {
      setMessage("회원가입이 아직 완료되지 않았습니다.");
      return;
    }

    await setActive({ session: sessionId });
    router.replace("/onboarding");
  };

  const createAccount = async () => {
    if (!isLoaded || pending) return;
    setPending(true);
    setMessage(null);

    try {
      const result = await signUp.create({
        emailAddress: email.trim(),
        password,
        firstName: name.trim() || undefined,
      });

      if (result.status === "complete") {
        await completeSession(result.createdSessionId);
        return;
      }

      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setNeedsCode(true);
      setMessage("이메일로 받은 인증 코드를 입력해 주세요.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setPending(false);
    }
  };

  const continueWithGoogle = async () => {
    if (googlePending) return;
    setGooglePending(true);
    setMessage(null);

    try {
      const result = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: oauthRedirectUrl,
        unsafeMetadata: name.trim() ? { displayName: name.trim() } : undefined,
      });

      if (result.createdSessionId && result.setActive) {
        await result.setActive({ session: result.createdSessionId });
        router.replace("/onboarding");
        return;
      }

      setMessage("Google 회원가입 창이 닫혀 세션이 생성되지 않았습니다.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setGooglePending(false);
    }
  };

  const verifyCode = async () => {
    if (!isLoaded || pending) return;
    setPending(true);
    setMessage(null);

    try {
      const result = await signUp.attemptEmailAddressVerification({ code: code.trim() });
      if (result.status === "complete") {
        await completeSession(result.createdSessionId);
        return;
      }

      setMessage("이메일 인증이 아직 완료되지 않았습니다.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <Screen>
      <Stack>
        <Kicker>Signup</Kicker>
        <Heading>HairFit 계정 만들기</Heading>
        <BodyText>계정을 만든 뒤 간단한 설정을 완료하면 모바일에서 헤어 생성과 스타일 추천을 바로 시작할 수 있습니다.</BodyText>
      </Stack>

      <Panel>
        <Stack>
          <Button disabled={googlePending || pending} variant="secondary" onPress={continueWithGoogle}>
            {googlePending ? "Google 회원가입 창 여는 중..." : "Google로 계속하기"}
          </Button>
          <TextField label="이름" onChangeText={setName} placeholder="이름" value={name} />
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
          {needsCode ? (
            <TextField
              autoCapitalize="none"
              keyboardType="number-pad"
              label="이메일 인증 코드"
              onChangeText={setCode}
              placeholder="123456"
              value={code}
            />
          ) : null}
          {message ? <BodyText>{message}</BodyText> : null}
          {needsCode ? (
            <Button disabled={!code.trim() || pending} onPress={verifyCode}>
              {pending ? "인증 중..." : "이메일 인증"}
            </Button>
          ) : (
            <Button disabled={!email.trim() || !password || pending} onPress={createAccount}>
              {pending ? "가입 중..." : "회원가입"}
            </Button>
          )}
          <Button variant="secondary" onPress={() => router.push("/login")}>
            이미 계정이 있어요
          </Button>
        </Stack>
      </Panel>
    </Screen>
  );
}
