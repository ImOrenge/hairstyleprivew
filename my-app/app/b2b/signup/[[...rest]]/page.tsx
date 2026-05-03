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

export default function B2BSignupPage() {
  const clerkConfig = getClerkConfigState();
  const hasClerkKey = clerkConfig.canUseClerkFrontend;

  if (!hasClerkKey) {
    const reasonText =
      clerkConfig.issue === "mismatched_key_types"
        ? "Clerk publishable key와 secret key의 환경이 서로 다릅니다. pk_test_에는 sk_test_, pk_live_에는 sk_live_를 함께 사용해 주세요."
        : "Clerk 키가 설정되지 않았습니다. my-app/.env.local에 NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY와 CLERK_SECRET_KEY를 설정해 주세요.";

    return (
      <AppPage as="main" className="max-w-xl pb-16 pt-8">
        <Panel className="p-5 sm:p-6">
          <h1 className="text-2xl font-bold text-[var(--app-text)]">B2B 회원가입</h1>
          <p className="mt-3 text-sm text-[var(--app-muted)]">{reasonText}</p>
        </Panel>
      </AppPage>
    );
  }

  return (
    <AppPage as="main" className="flex max-w-md justify-center pb-16 pt-8">
      <SignUp
        path="/b2b/signup"
        signInUrl="/login"
        fallbackRedirectUrl="/onboarding?account_type=salon_owner&return_url=%2Fsalon%2Fcustomers"
        appearance={clerkAppearance}
      />
    </AppPage>
  );
}
