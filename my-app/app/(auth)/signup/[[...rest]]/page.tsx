import { SignupWithMarketingConsent } from "../../../../components/auth/SignupWithMarketingConsent";
import { AppPage, Panel } from "../../../../components/ui/Surface";
import { getClerkConfigState } from "../../../../lib/clerk";

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
      <SignupWithMarketingConsent />
    </AppPage>
  );
}
