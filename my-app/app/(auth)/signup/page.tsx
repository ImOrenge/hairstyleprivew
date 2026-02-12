import { SignUp } from "@clerk/nextjs";
import { getClerkConfigState } from "../../../lib/clerk";

export default function SignupPage() {
  const clerkConfig = getClerkConfigState();
  const hasClerkKey = clerkConfig.canUseClerkFrontend;

  if (!hasClerkKey) {
    const reasonText =
      clerkConfig.issue === "live_key_on_local_dev"
        ? "현재 로컬 개발 환경에서 프로덕션 Clerk 키(pk_live_)를 사용 중이라 위젯이 차단됩니다. 로컬에서는 테스트 키(pk_test_, sk_test_)를 사용해 주세요."
        : "Clerk 키가 설정되지 않았습니다. my-app/.env.local에 NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY를 설정해 주세요.";

    return (
      <div className="mx-auto w-full max-w-xl px-6 py-10">
        <h1 className="text-2xl font-bold">회원가입</h1>
        <p className="mt-3 text-sm text-gray-600">{reasonText}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md justify-center px-6 py-10">
      <SignUp path="/signup" signInUrl="/login" fallbackRedirectUrl="/mypage" />
    </div>
  );
}
