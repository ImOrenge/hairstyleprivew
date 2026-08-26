import { SignIn } from "@clerk/nextjs";
import { LoginAuthGate } from "../../../../components/auth/LoginAuthGate";
import { AppPage, Panel } from "../../../../components/ui/Surface";
import { getClerkConfigState, getSafeClerkReturnPath } from "../../../../lib/clerk";

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

interface LoginPageProps {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const clerkConfig = getClerkConfigState();
  const hasClerkKey = clerkConfig.canUseClerkFrontend;
  const query = await searchParams;
  const rawReturnPath = Array.isArray(query.redirect_url) ? query.redirect_url[0] : query.redirect_url;
  const returnPath = getSafeClerkReturnPath(rawReturnPath) ?? "/home";

  if (!hasClerkKey) {
    const reasonText = "로그인 기능을 준비하지 못했습니다. 잠시 후 다시 열거나 고객지원으로 문의해 주세요.";

    return (
      <AppPage className="max-w-xl pb-16 pt-8">
        <Panel className="p-5 sm:p-6">
          <h1 className="text-2xl font-bold text-[var(--app-text)]">로그인</h1>
          <p className="mt-3 text-sm text-[var(--app-muted)]">{reasonText}</p>
        </Panel>
      </AppPage>
    );
  }

  return (
    <AppPage className="flex max-w-md justify-center pb-16 pt-8">
      <LoginAuthGate returnPath={returnPath}>
        <SignIn
          path="/login"
          signUpUrl="/signup"
          oauthFlow="redirect"
          fallbackRedirectUrl={returnPath}
          signUpFallbackRedirectUrl={returnPath}
          appearance={clerkAppearance}
        />
      </LoginAuthGate>
    </AppPage>
  );
}
