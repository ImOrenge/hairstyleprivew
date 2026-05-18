import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { OnboardingForm } from "../../components/onboarding/OnboardingForm";
import { AppPage } from "../../components/ui/Surface";
import { buildSignInRedirectUrl } from "../../lib/clerk";
import {
  isOnboardingAccountType,
  normalizeAppPath,
} from "../../lib/onboarding";

type SearchParams = Record<string, string | string[] | undefined>;

function pickFirst(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

async function readOnboardingUserId() {
  try {
    const { userId } = await auth();
    return userId;
  } catch (error) {
    console.error("[onboarding/page] Failed to read Clerk auth:", error);
    return null;
  }
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const requestedAccountType = pickFirst(resolvedSearchParams.account_type);
  const forcedAccountType = isOnboardingAccountType(requestedAccountType) ? requestedAccountType : undefined;
  const defaultReturnUrl = forcedAccountType === "salon_owner" ? "/salon/customers" : "/mypage";
  const returnUrl = normalizeAppPath(pickFirst(resolvedSearchParams.return_url), defaultReturnUrl);
  const signInTarget = forcedAccountType
    ? `/onboarding?account_type=${encodeURIComponent(forcedAccountType)}&return_url=${encodeURIComponent(returnUrl)}`
    : "/onboarding";

  const userId = await readOnboardingUserId();
  if (!userId) {
    redirect(buildSignInRedirectUrl(signInTarget));
  }

  return (
    <AppPage className="flex max-w-5xl flex-col gap-6 py-10">
      <header className="space-y-2">
        <p className="app-kicker">Account Setup</p>
        <h1 className="text-3xl font-black tracking-tight text-[var(--app-text)] sm:text-4xl">
          가입을 마무리하려면 추가 정보를 입력해 주세요
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
          계정 유형에 맞는 기본 정보를 먼저 등록하면 이후 추천, 생성, 마이페이지 흐름을 정상적으로 사용할 수 있습니다.
        </p>
      </header>

      <OnboardingForm returnUrl={returnUrl} forcedAccountType={forcedAccountType} />
    </AppPage>
  );
}
