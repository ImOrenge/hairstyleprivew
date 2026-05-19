import { useSSO, useSignUp } from "@clerk/clerk-expo";
import * as AuthSession from "expo-auth-session";
import { useRouter } from "expo-router";
import { type ReactNode, useState } from "react";
import { Platform } from "react-native";
import { BodyText, Button, Heading, Kicker, Panel, Screen, Stack, TextField, useThemeColors } from "@hairfit/ui-native";

const oauthRedirectUrl = AuthSession.makeRedirectUri({ path: "signup" });
const webOauthCallbackPath = "/sso-callback";

function webUrl(path: string) {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return path;
  }

  return new URL(path, window.location.origin).toString();
}

function openOAuthPopup() {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return null;
  }

  return window.open(
    window.location.origin,
    "hairfit-oauth",
    "width=500,height=720,left=100,top=100,noopener=no,noreferrer=no",
  );
}

function WebOAuthButton({
  children,
  disabled,
  onPress,
}: {
  children: ReactNode;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useThemeColors();

  if (Platform.OS !== "web") {
    return (
      <Button disabled={disabled} variant="secondary" onPress={onPress}>
        {children}
      </Button>
    );
  }

  return (
    <button
      disabled={disabled}
      onClick={onPress}
      style={{
        alignItems: "center",
        backgroundColor: theme.surface,
        borderColor: theme.border,
        borderRadius: 4,
        borderStyle: "solid",
        borderWidth: 1,
        color: theme.text,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        fontFamily: "inherit",
        fontSize: 16,
        fontWeight: 800,
        justifyContent: "center",
        minHeight: 44,
        opacity: disabled ? 0.48 : 1,
        padding: "0 18px",
        width: "100%",
      }}
      type="button"
    >
      {children}
    </button>
  );
}

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
    router.replace("/");
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
    if (!isLoaded || googlePending) return;
    setGooglePending(true);
    setMessage(null);

    try {
      if (Platform.OS === "web") {
        const popup = openOAuthPopup();
        if (!popup) {
          setMessage("브라우저에서 팝업이 차단되었습니다. 팝업 허용 후 다시 시도해 주세요.");
          return;
        }

        await signUp.authenticateWithPopup({
          popup,
          strategy: "oauth_google",
          redirectUrl: webUrl(webOauthCallbackPath),
          redirectUrlComplete: webUrl("/"),
          unsafeMetadata: name.trim() ? { displayName: name.trim() } : undefined,
        });

        if (signUp.createdSessionId) {
          await setActive({ session: signUp.createdSessionId });
        }
        router.replace("/");
        return;
      }

      const result = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: oauthRedirectUrl,
        unsafeMetadata: name.trim() ? { displayName: name.trim() } : undefined,
      });

      if (result.createdSessionId && result.setActive) {
        await result.setActive({ session: result.createdSessionId });
        router.replace("/");
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
          <WebOAuthButton disabled={googlePending || pending} onPress={continueWithGoogle}>
            {googlePending ? "Google 회원가입 창 여는 중..." : "Google로 계속하기"}
          </WebOAuthButton>
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
