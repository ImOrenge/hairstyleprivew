import { useSSO, useSignUp } from "@clerk/clerk-expo";
import * as AuthSession from "expo-auth-session";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Platform, type TextInput, View } from "react-native";
import {
  BodyText,
  Button,
  FormScreen,
  Heading,
  Kicker,
  Panel,
  Stack,
  TextField,
  useThemeColors,
} from "@hairfit/ui-native";
import {
  buildAuthRoute,
  consumeAuthResumePath,
  parseResumeTargetParam,
  pendingResumeStore,
  resolveAuthResumePath,
} from "../../lib/auth-resume";
import {
  mapAuthFormError,
  validateSignupFields,
  type AuthFieldErrors,
  type AuthFormField,
} from "../../lib/auth-form";

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

export default function SignupScreen() {
  const router = useRouter();
  const { resume } = useLocalSearchParams<{ resume?: string | string[] }>();
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
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [errorFocus, setErrorFocus] = useState<{
    field: AuthFormField;
    request: number;
  }>({ field: "email", request: 0 });
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const codeRef = useRef<TextInput>(null);
  const resumeParam = Array.isArray(resume) ? resume[0] : resume;
  const resumeTarget = useMemo(() => parseResumeTargetParam(resumeParam), [resumeParam]);

  useEffect(() => {
    if (resumeTarget) {
      void pendingResumeStore.save(resumeTarget);
    }
  }, [resumeTarget]);

  const completeSession = async (sessionId: string | null | undefined) => {
    if (!sessionId || !setActive) {
      setMessage("회원가입이 아직 완료되지 않았습니다.");
      return;
    }

    await setActive({ session: sessionId });
    const destination = await consumeAuthResumePath(resumeParam);
    router.replace(destination as Href);
  };

  const requestFieldFocus = (field: AuthFormField) => {
    setErrorFocus((current) => ({ field, request: current.request + 1 }));
  };

  const clearFieldError = (field: AuthFormField) => {
    setFieldErrors((current) => current[field]
      ? { ...current, [field]: undefined }
      : current);
  };

  const showAuthError = (error: unknown, fallbackMessage: string) => {
    const mapped = mapAuthFormError(error, fallbackMessage);
    const field = mapped.field;
    if (field) {
      setMessage(null);
      setFieldErrors((current) => ({ ...current, [field]: mapped.message }));
      requestFieldFocus(field);
    } else {
      setMessage(mapped.message);
    }
  };

  const createAccount = async () => {
    if (!isLoaded || pending) return;
    setMessage(null);
    const validation = validateSignupFields({ code, email, needsCode: false, password });
    setFieldErrors(validation.errors);
    if (validation.firstInvalidField) {
      requestFieldFocus(validation.firstInvalidField);
      return;
    }
    setPending(true);

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
      requestFieldFocus("code");
    } catch (error) {
      showAuthError(error, "회원가입에 실패했습니다. 입력 내용을 확인하고 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  };

  const continueWithGoogle = async () => {
    if (!isLoaded || googlePending) return;
    setGooglePending(true);
    setMessage(null);

    try {
      const resumePath = await resolveAuthResumePath(resumeParam);

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
          redirectUrlComplete: webUrl(resumePath),
          unsafeMetadata: name.trim() ? { displayName: name.trim() } : undefined,
        });

        if (signUp.createdSessionId) {
          await setActive({ session: signUp.createdSessionId });
        }
        const destination = await consumeAuthResumePath(resumeParam);
        router.replace(destination as Href);
        return;
      }

      const result = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: oauthRedirectUrl,
        unsafeMetadata: name.trim() ? { displayName: name.trim() } : undefined,
      });

      if (result.createdSessionId && result.setActive) {
        await result.setActive({ session: result.createdSessionId });
        const destination = await consumeAuthResumePath(resumeParam);
        router.replace(destination as Href);
        return;
      }

      setMessage("Google 회원가입 창이 닫혀 세션이 생성되지 않았습니다.");
    } catch (error) {
      setMessage(mapAuthFormError(
        error,
        "Google 회원가입을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      ).message);
    } finally {
      setGooglePending(false);
    }
  };

  const verifyCode = async () => {
    if (!isLoaded || pending) return;
    setMessage(null);
    const validation = validateSignupFields({ code, email, needsCode: true, password });
    setFieldErrors((current) => ({ ...current, ...validation.errors }));
    if (validation.firstInvalidField) {
      requestFieldFocus(validation.firstInvalidField);
      return;
    }
    setPending(true);

    try {
      const result = await signUp.attemptEmailAddressVerification({ code: code.trim() });
      if (result.status === "complete") {
        await completeSession(result.createdSessionId);
        return;
      }

      setMessage("이메일 인증이 아직 완료되지 않았습니다.");
    } catch (error) {
      showAuthError(error, "이메일 인증을 완료하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  };

  return (
    <FormScreen
      errorFocusRef={
        errorFocus.field === "email"
          ? emailRef
          : errorFocus.field === "password"
            ? passwordRef
            : codeRef
      }
      errorFocusRequest={errorFocus.request}
      footer={
        needsCode ? (
          <Button disabled={!isLoaded || pending} onPress={verifyCode}>
            {pending ? "인증 중..." : "이메일 인증"}
          </Button>
        ) : (
          <Button disabled={!isLoaded || pending} onPress={createAccount}>
            {pending ? "가입 중..." : "회원가입"}
          </Button>
        )
      }
      testID="signup-form-screen"
    >
      <Stack>
        <Kicker>회원가입</Kicker>
        <Heading>HairFit 계정 만들기</Heading>
        <BodyText>
          {resumeTarget
            ? resumeTarget.kind === "salon-match"
              ? "계정을 만든 뒤 확인 중이던 살롱 연결 동의 화면으로 돌아갑니다. 기존 HairFit 계정이 있다면 그 계정으로 로그인해 주세요."
              : "계정을 만든 뒤 안내받은 헤어 생성 결과로 바로 돌아갑니다. 결과 소유 계정이 따로 있다면 그 계정으로 로그인해 주세요."
            : "계정을 만든 뒤 간단한 설정을 완료하면 모바일에서 헤어 생성과 스타일 추천을 바로 시작할 수 있습니다."}
        </BodyText>
      </Stack>

      <Panel>
        <Stack>
          <WebOAuthButton disabled={googlePending || pending} onPress={continueWithGoogle}>
            {googlePending ? "Google 회원가입 창 여는 중..." : "Google로 계속하기"}
          </WebOAuthButton>
          <TextField label="이름" onChangeText={setName} placeholder="이름" value={name} />
          <TextField
            autoCapitalize="none"
            error={fieldErrors.email}
            keyboardType="email-address"
            label="이메일"
            onChangeText={(value) => {
              setEmail(value);
              clearFieldError("email");
            }}
            placeholder="you@example.com"
            ref={emailRef}
            value={email}
          />
          <TextField
            error={fieldErrors.password}
            label="비밀번호"
            onChangeText={(value) => {
              setPassword(value);
              clearFieldError("password");
            }}
            placeholder="비밀번호"
            ref={passwordRef}
            secureTextEntry
            value={password}
          />
          {needsCode ? (
            <TextField
              autoCapitalize="none"
              error={fieldErrors.code}
              keyboardType="number-pad"
              label="이메일 인증 코드"
              onChangeText={(value) => {
                setCode(value);
                clearFieldError("code");
              }}
              placeholder="123456"
              ref={codeRef}
              value={code}
            />
          ) : null}
          {message ? (
            <View accessibilityLiveRegion="polite">
              <BodyText>{message}</BodyText>
            </View>
          ) : null}
          <Button
            variant="secondary"
            onPress={() => router.push(buildAuthRoute("/login", resumeTarget) as Href)}
          >
            이미 계정이 있어요
          </Button>
        </Stack>
      </Panel>
    </FormScreen>
  );
}
