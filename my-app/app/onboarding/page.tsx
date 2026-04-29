import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { OnboardingForm } from "../../components/onboarding/OnboardingForm";
import { AppPage } from "../../components/ui/Surface";
import { buildSignInRedirectUrl } from "../../lib/clerk";
import { normalizeAppPath, parseOnboardingMetadata } from "../../lib/onboarding";

type SearchParams = Record<string, string | string[] | undefined>;

function pickFirst(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect(buildSignInRedirectUrl("/onboarding"));
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const returnUrl = normalizeAppPath(pickFirst(resolvedSearchParams.return_url), "/mypage");
  const clerkUser = await currentUser();
  const metadata = parseOnboardingMetadata(clerkUser?.publicMetadata);

  if (metadata.onboardingComplete && metadata.accountType) {
    redirect(returnUrl);
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

      <OnboardingForm returnUrl={returnUrl} />
    </AppPage>
  );
}
