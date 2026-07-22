import { useSSO, useSignIn } from "@clerk/clerk-expo";
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
import { AuthSecondFactorPanel } from "../../components/auth/AuthSecondFactorPanel";
import {
  buildAuthRoute,
  consumeAuthResumePath,
  parseResumeTargetParam,
  pendingResumeStore,
  resolveAuthResumePath,
} from "../../lib/auth-resume";
import {
  mapAuthFormError,
  validateLoginFields,
  type AuthFieldErrors,
  type AuthFormField,
} from "../../lib/auth-form";
import {
  getAuthSecondFactorAttemptParams,
  getAuthSecondFactorPrepareParams,
  normalizeAuthSecondFactorOptions,
  type AuthSecondFactorOption,
} from "../../lib/auth-second-factor";

const oauthRedirectUrl = AuthSession.makeRedirectUri({ path: "login" });
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

export default function LoginScreen() {
  const router = useRouter();
  const { resume } = useLocalSearchParams<{ resume?: string | string[] }>();
  const { isLoaded, signIn, setActive } = useSignIn();
  const { startSSOFlow } = useSSO();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secondFactorCode, setSecondFactorCode] = useState("");
  const [secondFactorOptions, setSecondFactorOptions] = useState<AuthSecondFactorOption[]>([]);
  const [secondFactorOption, setSecondFactorOption] = useState<AuthSecondFactorOption | null>(null);
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

  const navigateAfterAuth = async () => {
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

  const prepareSecondFactor = async (
    option: AuthSecondFactorOption,
    resource?: NonNullable<typeof signIn>,
  ) => {
    const currentResource = resource ?? signIn;
    if (!currentResource) throw new Error("Sign-in is not ready");
    const params = getAuthSecondFactorPrepareParams(option);
    if (params) await currentResource.prepareSecondFactor(params);
    setSecondFactorOption(option);
    setSecondFactorCode("");
    clearFieldError("code");
  };

  const beginSecondFactor = async (resource: NonNullable<typeof signIn>) => {
    const options = normalizeAuthSecondFactorOptions(resource.supportedSecondFactors);
    const option = options[0];
    if (!option) {
      setMessage("이 계정의 추가 인증 방법을 앱에서 확인할 수 없습니다. 웹 로그인에서 인증을 완료해 주세요.");
      return false;
    }

    await prepareSecondFactor(option, resource);
    setSecondFactorOptions(options);
    setMessage("계정을 보호하기 위한 추가 인증이 필요합니다.");
    requestFieldFocus("code");
    return true;
  };

  const submit = async () => {
    if (!isLoaded || pending) return;
    setMessage(null);
    const validation = validateLoginFields({ email, password });
    setFieldErrors(validation.errors);
    if (validation.firstInvalidField === "email" || validation.firstInvalidField === "password") {
      requestFieldFocus(validation.firstInvalidField);
      return;
    }
    setPending(true);

    try {
      const result = await signIn.create({
        identifier: email.trim(),
        password,
      });

      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        await navigateAfterAuth();
        return;
      }

      if (result.status === "needs_second_factor") {
        await beginSecondFactor(result);
        return;
      }

      setMessage("로그인을 완료하기 위한 다음 단계를 확인하지 못했습니다. 웹 로그인에서 다시 시도해 주세요.");
    } catch (error) {
      const mapped = mapAuthFormError(error, "로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      const field = mapped.field;
      if (field === "email" || field === "password") {
        setMessage(null);
        setFieldErrors((current) => ({ ...current, [field]: mapped.message }));
        requestFieldFocus(field);
      } else {
        setMessage(mapped.message);
      }
    } finally {
      setPending(false);
    }
  };

  const signInWithGoogle = async () => {
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

        await signIn.authenticateWithPopup({
          popup,
          strategy: "oauth_google",
          redirectUrl: webUrl(webOauthCallbackPath),
          redirectUrlComplete: webUrl(resumePath),
        });

        if (signIn.createdSessionId) {
          await setActive({ session: signIn.createdSessionId });
        }
        await navigateAfterAuth();
        return;
      }

      const result = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: oauthRedirectUrl,
      });

      if (result.createdSessionId && result.setActive) {
        await result.setActive({ session: result.createdSessionId });
        await navigateAfterAuth();
        return;
      }

      setMessage("Google 로그인 창이 닫혀 세션이 생성되지 않았습니다.");
    } catch (error) {
      setMessage(mapAuthFormError(
        error,
        "Google 로그인을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      ).message);
    } finally {
      setGooglePending(false);
    }
  };

  const submitSecondFactor = async () => {
    if (!isLoaded || pending || !secondFactorOption) return;
    const attempt = getAuthSecondFactorAttemptParams(secondFactorOption, secondFactorCode);
    if (!attempt) {
      setFieldErrors((current) => ({
        ...current,
        code: "인증 코드를 입력해 주세요.",
      }));
      requestFieldFocus("code");
      return;
    }

    setPending(true);
    setMessage(null);
    clearFieldError("code");
    try {
      const result = await signIn.attemptSecondFactor(attempt);
      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        await navigateAfterAuth();
        return;
      }
      setMessage("추가 인증이 아직 완료되지 않았습니다. 코드를 다시 확인해 주세요.");
    } catch (error) {
      const mapped = mapAuthFormError(error, "추가 인증을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setFieldErrors((current) => ({ ...current, code: mapped.message }));
      requestFieldFocus("code");
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
        <Button
          disabled={!isLoaded || pending}
          onPress={secondFactorOption ? submitSecondFactor : submit}
        >
          {pending
            ? secondFactorOption
              ? "추가 인증 확인 중..."
              : "로그인 중..."
            : secondFactorOption
              ? "추가 인증 완료"
              : "로그인"}
        </Button>
      }
      testID="login-form-screen"
    >
      <Stack>
        <Kicker>로그인</Kicker>
        <Heading>HairFit에 로그인</Heading>
        <BodyText>
          {resumeTarget
            ? resumeTarget.kind === "salon-match"
              ? "로그인 후 확인 중이던 살롱 연결 동의 화면으로 돌아갑니다."
              : "완료 안내를 받은 계정으로 로그인하면 보던 헤어 생성 결과로 바로 돌아갑니다."
            : "웹에서 사용하는 같은 계정으로 로그인하면 모바일에서도 시술 확정 스타일과 생성 작업 현황을 이어서 확인할 수 있습니다."}
        </BodyText>
      </Stack>

      {secondFactorOption ? (
        <AuthSecondFactorPanel
          code={secondFactorCode}
          codeInputRef={codeRef}
          error={fieldErrors.code}
          onCancel={() => {
            setSecondFactorOption(null);
            setSecondFactorOptions([]);
            setSecondFactorCode("");
            setMessage(null);
            clearFieldError("code");
            requestFieldFocus("email");
          }}
          onChangeCode={(value) => {
            setSecondFactorCode(value);
            clearFieldError("code");
          }}
          onSelect={(option) => {
            setPending(true);
            setMessage(null);
            void prepareSecondFactor(option)
              .then(() => {
                setMessage("선택한 방법으로 추가 인증을 계속합니다.");
                requestFieldFocus("code");
              })
              .catch((error) => {
                setMessage(mapAuthFormError(
                  error,
                  "선택한 인증 방법을 준비하지 못했습니다. 다른 방법을 선택해 주세요.",
                ).message);
              })
              .finally(() => setPending(false));
          }}
          option={secondFactorOption}
          options={secondFactorOptions}
          pending={pending}
        />
      ) : (
      <Panel>
        <Stack>
          <WebOAuthButton disabled={googlePending || pending} onPress={signInWithGoogle}>
            {googlePending ? "Google 로그인 창 여는 중..." : "Google로 계속하기"}
          </WebOAuthButton>
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
          <Button
            variant="secondary"
            onPress={() => router.push(buildAuthRoute("/forgot-password", resumeTarget) as Href)}
          >
            비밀번호를 잊었어요
          </Button>
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
          {message ? (
            <View accessibilityLiveRegion="assertive" accessibilityRole="alert">
              <BodyText>{message}</BodyText>
            </View>
          ) : null}
          <Button
            variant="secondary"
            onPress={() => router.push(buildAuthRoute("/signup", resumeTarget) as Href)}
          >
            회원가입
          </Button>
        </Stack>
      </Panel>
      )}
    </FormScreen>
  );
}
