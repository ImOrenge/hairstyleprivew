import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import ForgotPasswordScreen from "../app/(auth)/forgot-password";
import LoginScreen from "../app/(auth)/login";
import SignupScreen from "../app/(auth)/signup";

const mockSignInCreate = jest.fn();
const mockPrepareFirstFactor = jest.fn();
const mockAttemptFirstFactor = jest.fn();
const mockPrepareSecondFactor = jest.fn();
const mockAttemptSecondFactor = jest.fn();
const mockResetPassword = jest.fn();
const mockSignUpCreate = jest.fn();
const mockPrepareVerification = jest.fn();
const mockAttemptVerification = jest.fn();
const mockSetActive = jest.fn();
const mockStartSSOFlow = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock("@clerk/clerk-expo", () => ({
  useSignIn: () => ({
    isLoaded: true,
    setActive: mockSetActive,
    signIn: {
      attemptFirstFactor: mockAttemptFirstFactor,
      attemptSecondFactor: mockAttemptSecondFactor,
      authenticateWithPopup: jest.fn(),
      create: mockSignInCreate,
      createdSessionId: null,
      prepareFirstFactor: mockPrepareFirstFactor,
      prepareSecondFactor: mockPrepareSecondFactor,
      resetPassword: mockResetPassword,
      supportedSecondFactors: [],
    },
  }),
  useSignUp: () => ({
    isLoaded: true,
    setActive: mockSetActive,
    signUp: {
      attemptEmailAddressVerification: mockAttemptVerification,
      authenticateWithPopup: jest.fn(),
      create: mockSignUpCreate,
      createdSessionId: null,
      prepareEmailAddressVerification: mockPrepareVerification,
    },
  }),
  useSSO: () => ({ startSSOFlow: mockStartSSOFlow }),
}));

jest.mock("expo-auth-session", () => ({
  makeRedirectUri: () => "hairfit://auth",
}));

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

jest.mock("react-native-safe-area-context", () => {
  const ReactModule = jest.requireActual<typeof import("react")>("react");
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) =>
      ReactModule.createElement(View, props, children),
  };
});

describe("auth form screen behavior", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("login submit reveals all required fields before calling Clerk", async () => {
    await render(<LoginScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "로그인" }));

    expect(screen.getByText("이메일을 입력해 주세요.")).toBeOnTheScreen();
    expect(screen.getByText("비밀번호를 입력해 주세요.")).toBeOnTheScreen();
    expect(mockSignInCreate).not.toHaveBeenCalled();
  });

  test("login maps provider password errors without exposing raw details", async () => {
    mockSignInCreate.mockRejectedValueOnce({
      errors: [{
        code: "form_password_incorrect",
        longMessage: "sensitive provider detail",
        meta: { paramName: "password" },
      }],
    });
    await render(<LoginScreen />);
    await fireEvent.changeText(screen.getByLabelText("이메일"), "member@hairfit.test");
    await fireEvent.changeText(screen.getByLabelText("비밀번호"), "wrong");

    await fireEvent.press(screen.getByRole("button", { name: "로그인" }));

    await waitFor(() => {
      expect(screen.getByText("비밀번호를 확인하고 다시 입력해 주세요.")).toBeOnTheScreen();
    });
    expect(screen.queryByText("sensitive provider detail")).not.toBeOnTheScreen();
  });

  test("login completes an available second-factor step inside the app", async () => {
    mockSignInCreate.mockResolvedValueOnce({
      createdSessionId: null,
      prepareSecondFactor: mockPrepareSecondFactor,
      status: "needs_second_factor",
      supportedSecondFactors: [{
        emailAddressId: "idn_email",
        safeIdentifier: "m***@hairfit.test",
        strategy: "email_code",
      }],
    });
    mockPrepareSecondFactor.mockResolvedValueOnce(undefined);
    mockAttemptSecondFactor.mockResolvedValueOnce({
      createdSessionId: null,
      status: "needs_second_factor",
    });
    await render(<LoginScreen />);
    await fireEvent.changeText(screen.getByLabelText("이메일"), "member@hairfit.test");
    await fireEvent.changeText(screen.getByLabelText("비밀번호"), "secret");

    await fireEvent.press(screen.getByRole("button", { name: "로그인" }));
    expect(await screen.findByText("추가 인증")).toBeOnTheScreen();
    expect(mockPrepareSecondFactor).toHaveBeenCalledWith({
      emailAddressId: "idn_email",
      strategy: "email_code",
    });

    await fireEvent.changeText(screen.getByLabelText("이메일 코드 · m***@hairfit.test"), "123456");
    await fireEvent.press(screen.getByRole("button", { name: "추가 인증 완료" }));
    await waitFor(() => {
      expect(mockAttemptSecondFactor).toHaveBeenCalledWith({
        code: "123456",
        strategy: "email_code",
      });
    });
  });

  test("signup submit reveals required account fields before calling Clerk", async () => {
    await render(<SignupScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "회원가입" }));

    expect(screen.getByText("이메일을 입력해 주세요.")).toBeOnTheScreen();
    expect(screen.getByText("비밀번호를 입력해 주세요.")).toBeOnTheScreen();
    expect(mockSignUpCreate).not.toHaveBeenCalled();
  });

  test("signup validates the newly mounted email-code field", async () => {
    mockSignUpCreate.mockResolvedValueOnce({ createdSessionId: null, status: "missing_requirements" });
    mockPrepareVerification.mockResolvedValueOnce(undefined);
    await render(<SignupScreen />);
    await fireEvent.changeText(screen.getByLabelText("이메일"), "new@hairfit.test");
    await fireEvent.changeText(screen.getByLabelText("비밀번호"), "secret");

    await fireEvent.press(screen.getByRole("button", { name: "회원가입" }));
    const verificationButton = await screen.findByRole("button", { name: "이메일 인증" });
    await fireEvent.press(verificationButton);

    expect(screen.getByText("이메일로 받은 인증 코드를 입력해 주세요.")).toBeOnTheScreen();
    expect(mockAttemptVerification).not.toHaveBeenCalled();
  });

  test("forgot-password verifies email code, validates confirmation, and keeps MFA in-app", async () => {
    mockSignInCreate.mockResolvedValueOnce({
      prepareFirstFactor: mockPrepareFirstFactor,
      supportedFirstFactors: [{
        emailAddressId: "idn_reset",
        safeIdentifier: "m***@hairfit.test",
        strategy: "reset_password_email_code",
      }],
    });
    mockPrepareFirstFactor.mockResolvedValueOnce(undefined);
    mockAttemptFirstFactor.mockResolvedValueOnce({ status: "needs_new_password" });
    mockResetPassword.mockResolvedValueOnce({
      createdSessionId: null,
      status: "needs_second_factor",
      supportedSecondFactors: [{ strategy: "totp" }],
    });
    await render(<ForgotPasswordScreen />);
    await fireEvent.changeText(screen.getByLabelText("계정 이메일"), "member@hairfit.test");
    await fireEvent.press(screen.getByRole("button", { name: "재설정 코드 받기" }));

    const resetCode = await screen.findByLabelText("재설정 코드");
    await fireEvent.changeText(resetCode, "654321");
    await fireEvent.press(screen.getByRole("button", { name: "재설정 코드 확인" }));

    const password = await screen.findByLabelText("새 비밀번호");
    await fireEvent.changeText(password, "new-secret");
    await fireEvent.changeText(screen.getByLabelText("새 비밀번호 확인"), "different");
    await fireEvent.press(screen.getByRole("button", { name: "새 비밀번호 저장" }));
    expect(screen.getByText("새 비밀번호가 서로 일치하지 않습니다.")).toBeOnTheScreen();
    expect(mockResetPassword).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText("새 비밀번호 확인"), "new-secret");
    await fireEvent.press(screen.getByRole("button", { name: "새 비밀번호 저장" }));
    expect(await screen.findByText("추가 인증")).toBeOnTheScreen();
    expect(screen.getByLabelText("인증 앱 코드")).toBeOnTheScreen();
    expect(mockResetPassword).toHaveBeenCalledWith({
      password: "new-secret",
      signOutOfOtherSessions: true,
    });
  });
});
