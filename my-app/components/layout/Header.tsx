"use client";

import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { useT } from "../../lib/i18n/useT";
import { AdminNavLink } from "./AdminNavLink";
import { LanguageSwitch } from "./LanguageSwitch";
import { ThemeToggle } from "./ThemeToggle";
import { HeaderAuthSlot, MobileHeaderAuthSlot, MobileSignupMenuLink } from "./HeaderAuthSlot";

export function Header() {
  const t = useT();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const closeMobileMenu = () => setIsMobileMenuOpen(false);
  const mobileMenuLinkClassName =
    "rounded-lg px-3 py-2.5 text-stone-700 hover:bg-stone-100 hover:text-black dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white";

  return (
    <header className="sticky top-0 z-50 border-b border-stone-200/60 bg-white/80 backdrop-blur transition-colors dark:border-zinc-800/60 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
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
          <AdminNavLink label="Admin" />

          <div className="flex shrink-0 items-center gap-2">
            <HeaderAuthSlot />
          </div>
          <div className="flex items-center gap-1 border-l border-stone-200 pl-3 dark:border-zinc-800">
            <ThemeToggle />
            <LanguageSwitch />
          </div>
        </nav>

        <div className="flex min-w-0 items-center gap-1.5 md:hidden">
          <MobileHeaderAuthSlot />
          <button
            type="button"
            aria-label={isMobileMenuOpen ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen((current) => !current)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-300 text-stone-900 transition hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 dark:border-zinc-700 dark:text-white dark:hover:bg-zinc-800"
          >
            {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {isMobileMenuOpen ? (
        <div className="border-t border-stone-200 bg-white px-4 py-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-950 md:hidden">
          <nav className="mx-auto flex w-full max-w-6xl flex-col gap-1 text-sm font-semibold">
            <Link
              href="/upload"
              onClick={closeMobileMenu}
              className={mobileMenuLinkClassName}
            >
              {t("nav.upload")}
            </Link>
            <Link
              href="/generate"
              onClick={closeMobileMenu}
              className={mobileMenuLinkClassName}
            >
              {t("nav.generate")}
            </Link>
            <Link
              href="/salon/customers"
              onClick={closeMobileMenu}
              className={mobileMenuLinkClassName}
            >
              Salon CRM
            </Link>
            <MobileSignupMenuLink className={mobileMenuLinkClassName} onClick={closeMobileMenu} />
            <AdminNavLink
              label="Admin"
              className={mobileMenuLinkClassName}
            />
            <div className="mt-2 flex items-center justify-between border-t border-stone-200 px-3 pt-3 dark:border-zinc-800">
              <span className="text-xs font-bold uppercase text-stone-400">Settings</span>
              <div className="flex items-center gap-1">
                <ThemeToggle />
                <LanguageSwitch />
              </div>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
