import { SignUp } from "@clerk/nextjs";
import { getClerkConfigState } from "../../../../lib/clerk";

export default function SignupPage() {
  const clerkConfig = getClerkConfigState();
  const hasClerkKey = clerkConfig.canUseClerkFrontend;

  if (!hasClerkKey) {
    const reasonText =
      clerkConfig.issue === "live_key_on_local_dev"
        ? "?꾩옱 濡쒖뺄 媛쒕컻 ?섍꼍?먯꽌 ?꾨줈?뺤뀡 Clerk ??pk_live_)瑜??ъ슜 以묒씠???꾩젽??李⑤떒?⑸땲?? 濡쒖뺄?먯꽌???뚯뒪????pk_test_, sk_test_)瑜??ъ슜??二쇱꽭??"
        : "Clerk ?ㅺ? ?ㅼ젙?섏? ?딆븯?듬땲?? my-app/.env.local??NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY瑜??ㅼ젙??二쇱꽭??";

    return (
      <div className="mx-auto w-full max-w-xl px-6 py-10">
        <h1 className="text-2xl font-bold">Sign up</h1>
        <p className="mt-3 text-sm text-gray-600">{reasonText}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md justify-center px-6 py-10">
      <SignUp path="/signup" signInUrl="/login" fallbackRedirectUrl="/onboarding" />
    </div>
  );
}
