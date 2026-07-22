import { useSignIn } from "@clerk/clerk-expo";
import {
  BodyText,
  Button,
  FormScreen,
  Heading,
  Kicker,
  Panel,
  Stack,
  TextField,
} from "@hairfit/ui-native";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { type TextInput, View } from "react-native";
import { AuthSecondFactorPanel } from "../../components/auth/AuthSecondFactorPanel";
import {
  buildAuthRoute,
  consumeAuthResumePath,
  parseResumeTargetParam,
  pendingResumeStore,
} from "../../lib/auth-resume";
import { mapAuthFormError, type AuthFormField } from "../../lib/auth-form";
import {
  findPasswordResetEmailFactor,
  validateNewPassword,
} from "../../lib/auth-password-reset";
import {
  getAuthSecondFactorAttemptParams,
  getAuthSecondFactorPrepareParams,
  normalizeAuthSecondFactorOptions,
  type AuthSecondFactorOption,
} from "../../lib/auth-second-factor";

type ResetStep = "email" | "code" | "password" | "second-factor";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { resume } = useLocalSearchParams<{ resume?: string | string[] }>();
  const { isLoaded, signIn, setActive } = useSignIn();
  const [step, setStep] = useState<ResetStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [secondFactorCode, setSecondFactorCode] = useState("");
  const [secondFactorOptions, setSecondFactorOptions] = useState<AuthSecondFactorOption[]>([]);
  const [secondFactorOption, setSecondFactorOption] = useState<AuthSecondFactorOption | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ field: AuthFormField; message: string } | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const emailRef = useRef<TextInput>(null);
  const codeRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const resumeParam = Array.isArray(resume) ? resume[0] : resume;
  const resumeTarget = useMemo(() => parseResumeTargetParam(resumeParam), [resumeParam]);

  useEffect(() => {
    if (resumeTarget) void pendingResumeStore.save(resumeTarget);
  }, [resumeTarget]);

  const requestFocus = () => {
    setFocusRequest((current) => current + 1);
  };

  const focus = (field: AuthFormField, error: string) => {
    setFieldError({ field, message: error });
    requestFocus();
  };

  const clearError = (field: AuthFormField) => {
    setFieldError((current) => current?.field === field ? null : current);
  };

  const completeSession = async (sessionId: string) => {
    if (!setActive) throw new Error("Session activation is not ready");
    await setActive({ session: sessionId });
    const destination = await consumeAuthResumePath(resumeParam);
    router.replace(destination as Href);
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
    clearError("code");
  };

  const beginSecondFactor = async (resource: NonNullable<typeof signIn>) => {
    const options = normalizeAuthSecondFactorOptions(resource.supportedSecondFactors);
    const option = options[0];
    if (!option) {
      setMessage("비밀번호는 변경됐지만 이 계정의 추가 인증 방법을 앱에서 확인할 수 없습니다. 로그인 화면에서 다시 시도해 주세요.");
      return false;
    }
    await prepareSecondFactor(option, resource);
    setSecondFactorOptions(options);
    setStep("second-factor");
    setMessage("비밀번호 변경 후 계정을 보호하기 위한 추가 인증이 필요합니다.");
    requestFocus();
    return true;
  };

  const sendCode = async () => {
    if (!isLoaded || !signIn || pending) return;
    if (!email.trim()) {
      focus("email", "이메일을 입력해 주세요.");
      return;
    }
    setPending(true);
    setMessage(null);
    clearError("email");
    try {
      const created = await signIn.create({ identifier: email.trim() });
      const factor = findPasswordResetEmailFactor(created.supportedFirstFactors);
      if (!factor) {
        setMessage("이 계정에서 이메일 비밀번호 재설정을 사용할 수 없습니다. 다른 로그인 방법을 이용해 주세요.");
        return;
      }
      await created.prepareFirstFactor({
        strategy: factor.strategy,
        emailAddressId: factor.emailAddressId,
      });
      setStep("code");
      setMessage(`${factor.safeIdentifier ?? "입력한 이메일"}로 재설정 코드를 보냈습니다.`);
      requestFocus();
    } catch (error) {
      const mapped = mapAuthFormError(error, "비밀번호 재설정 코드를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
      focus(mapped.field ?? "email", mapped.message);
    } finally {
      setPending(false);
    }
  };

  const verifyCode = async () => {
    if (!isLoaded || !signIn || pending) return;
    if (!code.trim()) {
      focus("code", "이메일로 받은 재설정 코드를 입력해 주세요.");
      return;
    }
    setPending(true);
    setMessage(null);
    clearError("code");
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: code.trim(),
      });
      if (result.status !== "needs_new_password") {
        setMessage("재설정 코드 확인이 아직 완료되지 않았습니다. 코드를 다시 확인해 주세요.");
        return;
      }
      setStep("password");
      setMessage("새 비밀번호를 입력해 주세요.");
      requestFocus();
    } catch (error) {
      const mapped = mapAuthFormError(error, "재설정 코드를 확인하지 못했습니다. 다시 시도해 주세요.");
      focus("code", mapped.message);
    } finally {
      setPending(false);
    }
  };

  const submitPassword = async () => {
    if (!isLoaded || !signIn || pending) return;
    const validationError = validateNewPassword({ password, confirmation });
    if (validationError) {
      focus("password", validationError);
      return;
    }
    setPending(true);
    setMessage(null);
    clearError("password");
    try {
      const result = await signIn.resetPassword({
        password,
        signOutOfOtherSessions: true,
      });
      if (result.status === "complete" && result.createdSessionId) {
        await completeSession(result.createdSessionId);
        return;
      }
      if (result.status === "needs_second_factor") {
        await beginSecondFactor(result);
        return;
      }
      setMessage("비밀번호 변경 후 로그인 상태를 완료하지 못했습니다. 로그인 화면에서 다시 시도해 주세요.");
    } catch (error) {
      const mapped = mapAuthFormError(error, "새 비밀번호를 저장하지 못했습니다. 입력 내용을 확인해 주세요.");
      focus("password", mapped.message);
    } finally {
      setPending(false);
    }
  };

  const submitSecondFactor = async () => {
    if (!isLoaded || !signIn || !secondFactorOption || pending) return;
    const attempt = getAuthSecondFactorAttemptParams(secondFactorOption, secondFactorCode);
    if (!attempt) {
      focus("code", "인증 코드를 입력해 주세요.");
      return;
    }
    setPending(true);
    setMessage(null);
    clearError("code");
    try {
      const result = await signIn.attemptSecondFactor(attempt);
      if (result.status === "complete" && result.createdSessionId) {
        await completeSession(result.createdSessionId);
        return;
      }
      setMessage("추가 인증이 아직 완료되지 않았습니다. 코드를 다시 확인해 주세요.");
    } catch (error) {
      const mapped = mapAuthFormError(error, "추가 인증을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      focus("code", mapped.message);
    } finally {
      setPending(false);
    }
  };

  const backToLogin = () => router.replace(buildAuthRoute("/login", resumeTarget) as Href);
  const currentRef = step === "email" ? emailRef : step === "password" ? passwordRef : codeRef;
  const footerAction =
    step === "email"
      ? sendCode
      : step === "code"
        ? verifyCode
        : step === "password"
          ? submitPassword
          : submitSecondFactor;
  const footerLabel =
    step === "email"
      ? "재설정 코드 받기"
      : step === "code"
        ? "재설정 코드 확인"
        : step === "password"
          ? "새 비밀번호 저장"
          : "추가 인증 완료";

  return (
    <FormScreen
      errorFocusRef={currentRef}
      errorFocusRequest={focusRequest}
      footer={
        <Button disabled={!isLoaded || pending} onPress={footerAction}>
          {pending ? "확인 중..." : footerLabel}
        </Button>
      }
      testID="forgot-password-form-screen"
    >
      <Stack>
        <Kicker>계정 복구</Kicker>
        <Heading>비밀번호 재설정</Heading>
        <BodyText>재설정을 완료하면 로그인 전 확인하던 화면으로 안전하게 돌아갑니다.</BodyText>
      </Stack>

      {step === "second-factor" && secondFactorOption ? (
        <AuthSecondFactorPanel
          code={secondFactorCode}
          codeInputRef={codeRef}
          error={fieldError?.field === "code" ? fieldError.message : undefined}
          onCancel={backToLogin}
          onChangeCode={(value) => {
            setSecondFactorCode(value);
            clearError("code");
          }}
          onSelect={(option) => {
            setPending(true);
            setMessage(null);
            void prepareSecondFactor(option)
              .then(() => setMessage("선택한 방법으로 추가 인증을 계속합니다."))
              .catch((error) => setMessage(mapAuthFormError(
                error,
                "선택한 인증 방법을 준비하지 못했습니다. 다른 방법을 선택해 주세요.",
              ).message))
              .finally(() => setPending(false));
          }}
          option={secondFactorOption}
          options={secondFactorOptions}
          pending={pending}
        />
      ) : (
        <Panel>
          <Stack>
            {step === "email" ? (
              <TextField
                autoCapitalize="none"
                error={fieldError?.field === "email" ? fieldError.message : undefined}
                keyboardType="email-address"
                label="계정 이메일"
                onChangeText={(value) => {
                  setEmail(value);
                  clearError("email");
                }}
                placeholder="you@example.com"
                ref={emailRef}
                value={email}
              />
            ) : null}
            {step === "code" ? (
              <TextField
                autoCapitalize="none"
                error={fieldError?.field === "code" ? fieldError.message : undefined}
                keyboardType="number-pad"
                label="재설정 코드"
                onChangeText={(value) => {
                  setCode(value);
                  clearError("code");
                }}
                placeholder="인증 코드"
                ref={codeRef}
                value={code}
              />
            ) : null}
            {step === "password" ? (
              <>
                <TextField
                  error={fieldError?.field === "password" ? fieldError.message : undefined}
                  label="새 비밀번호"
                  onChangeText={(value) => {
                    setPassword(value);
                    clearError("password");
                  }}
                  placeholder="8자 이상"
                  ref={passwordRef}
                  secureTextEntry
                  value={password}
                />
                <TextField
                  label="새 비밀번호 확인"
                  onChangeText={setConfirmation}
                  placeholder="새 비밀번호 다시 입력"
                  secureTextEntry
                  value={confirmation}
                />
              </>
            ) : null}
            {message ? (
              <View accessibilityLiveRegion={fieldError ? "assertive" : "polite"} accessibilityRole={fieldError ? "alert" : undefined}>
                <BodyText>{message}</BodyText>
              </View>
            ) : null}
            <Button disabled={pending} onPress={backToLogin} variant="secondary">
              로그인으로 돌아가기
            </Button>
          </Stack>
        </Panel>
      )}
    </FormScreen>
  );
}
