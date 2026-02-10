import Link from "next/link";
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";

const navItems = [
  { href: "/upload", label: "업로드" },
  { href: "/generate", label: "스타일 생성" },
  { href: "/mypage", label: "마이페이지" },
];

export function Header() {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const hasClerkKey =
    typeof publishableKey === "string" &&
    publishableKey.startsWith("pk_") &&
    !publishableKey.includes("YOUR_");

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-xl font-bold">
          StyleMirror
        </Link>

        <nav className="flex items-center gap-4 text-sm text-gray-700">
          {hasClerkKey ? (
            <>
              <SignedIn>
                {navItems.map((item) => (
                  <Link key={item.href} href={item.href} className="hover:text-black">
                    {item.label}
                  </Link>
                ))}
              </SignedIn>

              <SignedOut>
                <SignInButton>
                  <button className="rounded-full border border-gray-300 px-4 py-2 text-xs font-semibold hover:bg-gray-100">
                    로그인
                  </button>
                </SignInButton>
                <SignUpButton>
                  <button className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800">
                    회원가입
                  </button>
                </SignUpButton>
              </SignedOut>

              <SignedIn>
                <UserButton />
              </SignedIn>
            </>
          ) : (
            <>
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} className="hover:text-black">
                  {item.label}
                </Link>
              ))}
              <Link
                href="/login"
                className="rounded-full border border-gray-300 px-4 py-2 text-xs font-semibold hover:bg-gray-100"
              >
                로그인
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800"
              >
                회원가입
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
