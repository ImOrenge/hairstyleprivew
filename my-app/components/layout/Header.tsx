"use client";

import Link from "next/link";
import Image from "next/image";
import { useT } from "../../lib/i18n/useT";
import { LanguageSwitch } from "./LanguageSwitch";
import { ThemeToggle } from "./ThemeToggle";
import { HeaderAuthSlot } from "./HeaderAuthSlot";

export function Header() {
  const t = useT();

  return (
    <header className="sticky top-0 z-50 border-b border-stone-200/60 bg-white/80 backdrop-blur transition-colors dark:border-zinc-800/60 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="HairFit Logo"
            width={36}
            height={36}
            className="h-9 w-auto object-contain transition-all dark:brightness-110"
          />
          <span className="text-xl font-black tracking-tighter text-zinc-900 dark:text-white">HairFit</span>
        </Link>

        <nav className="hidden items-center gap-4 text-sm font-medium md:flex">
          <Link href="/upload" className="text-stone-600 hover:text-black dark:text-zinc-400 dark:hover:text-white">
            {t("nav.upload")}
          </Link>
          <Link href="/generate" className="text-stone-600 hover:text-black dark:text-zinc-400 dark:hover:text-white">
            {t("nav.generate")}
          </Link>
          <Link href="/mypage" className="text-stone-600 hover:text-black dark:text-zinc-400 dark:hover:text-white">
            {t("nav.mypage")}
          </Link>
          <Link href="/salon/customers" className="text-stone-600 hover:text-black dark:text-zinc-400 dark:hover:text-white">
            Salon CRM
          </Link>

          <div className="flex shrink-0 items-center gap-2">
            <HeaderAuthSlot />
          </div>
          <div className="flex items-center gap-1 border-l border-stone-200 pl-3 dark:border-zinc-800">
            <ThemeToggle />
            <LanguageSwitch />
          </div>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <Link
            href="/upload"
            className="rounded-full bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-800 dark:bg-white dark:text-stone-900 dark:hover:bg-zinc-200"
          >
            {t("nav.upload")}
          </Link>
          <ThemeToggle />
          <LanguageSwitch />
        </div>
      </div>
    </header>
  );
}
