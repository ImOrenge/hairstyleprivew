"use client";

import Link from "next/link";
import Image from "next/image";
import { useT } from "../../lib/i18n/useT";
import { LanguageSwitch } from "./LanguageSwitch";
import { ClerkAuthButtons } from "./ClerkAuthButtons";

type HeaderProps = {
  clerkEnabled: boolean;
};

export function Header({ clerkEnabled }: HeaderProps) {
  const t = useT();

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="inline-flex items-center">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="HairFit"
              width={40}
              height={40}
              priority
              className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl"
            />
            <span className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
              HairFit
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-4 text-sm text-gray-700">
          <Link href="/upload" className="hover:text-black">{t("nav.upload")}</Link>
          <Link href="/generate" className="hover:text-black">{t("nav.generate")}</Link>
          <Link href="/mypage" className="hover:text-black">{t("nav.mypage")}</Link>

          {clerkEnabled ? (
            <ClerkAuthButtons />
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full border border-gray-300 px-4 py-2 text-xs font-semibold hover:bg-gray-100"
              >
                {t("nav.login")}
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800"
              >
                {t("nav.signup")}
              </Link>
            </>
          )}
          <LanguageSwitch />
        </nav>
      </div>
    </header>
  );
}
