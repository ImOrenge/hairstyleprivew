import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const hasClerkKey =
    typeof publishableKey === "string" &&
    publishableKey.startsWith("pk_") &&
    !publishableKey.includes("YOUR_");

  if (!hasClerkKey) {
    return (
      <div className="mx-auto w-full max-w-xl px-6 py-10">
        <h1 className="text-2xl font-bold">로그인</h1>
        <p className="mt-3 text-sm text-gray-600">
          Clerk 키가 설정되지 않았습니다. <code>my-app/.env.local</code>에
          <code className="mx-1">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code>,
          <code className="mx-1">CLERK_SECRET_KEY</code>를 설정해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md justify-center px-6 py-10">
      <SignIn
        path="/login"
        signUpUrl="/signup"
        fallbackRedirectUrl="/"
      />
    </div>
  );
}
