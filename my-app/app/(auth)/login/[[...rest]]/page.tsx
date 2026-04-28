import { SignIn } from "@clerk/nextjs";
import { getClerkConfigState } from "../../../../lib/clerk";

export default function LoginPage() {
  const clerkConfig = getClerkConfigState();
  const hasClerkKey = clerkConfig.canUseClerkFrontend;

  if (!hasClerkKey) {
    const reasonText =
      clerkConfig.issue === "mismatched_key_types"
        ? "Clerk publishable key와 secret key의 환경이 서로 다릅니다. pk_test_에는 sk_test_, pk_live_에는 sk_live_를 함께 사용해 주세요."
        : "Clerk 키가 설정되지 않았습니다. my-app/.env.local에 NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY와 CLERK_SECRET_KEY를 설정해 주세요.";

    return (
      <div className="mx-auto w-full max-w-xl px-6 py-10">
        <h1 className="text-2xl font-bold">로그인</h1>
        <p className="mt-3 text-sm text-gray-600">{reasonText}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md justify-center px-6 py-10">
      <SignIn path="/login" signUpUrl="/signup" fallbackRedirectUrl="/onboarding" />
    </div>
  );
}
