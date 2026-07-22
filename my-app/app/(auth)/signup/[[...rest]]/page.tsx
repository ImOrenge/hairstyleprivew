import { SignUp } from "@clerk/nextjs";
import { AppPage, Panel } from "../../../../components/ui/Surface";
import { getClerkConfigState } from "../../../../lib/clerk";

const clerkAppearance = {
  variables: {
    colorBackground: "var(--app-surface)",
    colorText: "var(--app-text)",
    colorTextSecondary: "var(--app-muted)",
    colorPrimary: "var(--app-accent)",
    colorInputBackground: "var(--app-surface-muted)",
    colorInputText: "var(--app-text)",
    borderRadius: "0.1875rem",
  },
  elements: {
    cardBox: "border border-[var(--app-border)] bg-[var(--app-surface)] shadow-none",
    headerTitle: "text-[var(--app-text)]",
    headerSubtitle: "text-[var(--app-muted)]",
    formButtonPrimary: "bg-[var(--app-inverse)] text-[var(--app-inverse-text)] hover:bg-[var(--app-inverse-muted)]",
    formFieldInput: "border-[var(--app-border)] bg-[var(--app-surface-muted)] text-[var(--app-text)]",
    footerActionLink: "text-[var(--app-accent)]",
  },
} as const;

export default function SignupPage() {
  const clerkConfig = getClerkConfigState();
  const hasClerkKey = clerkConfig.canUseClerkFrontend;

  if (!hasClerkKey) {
    const reasonText = "회원가입 기능을 준비하지 못했습니다. 잠시 후 다시 열거나 고객지원으로 문의해 주세요.";

    return (
      <AppPage className="max-w-xl pb-16 pt-8">
        <Panel className="p-5 sm:p-6">
          <h1 className="text-2xl font-bold text-[var(--app-text)]">회원가입</h1>
          <p className="mt-3 text-sm text-[var(--app-muted)]">{reasonText}</p>
        </Panel>
      </AppPage>
    );
  }

  return (
    <AppPage className="flex max-w-md justify-center pb-16 pt-8">
      <SignUp
        path="/signup"
        signInUrl="/login"
        oauthFlow="redirect"
        fallbackRedirectUrl="/home"
        appearance={clerkAppearance}
      />
    </AppPage>
  );
}
