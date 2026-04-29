"use client";

import Link from "next/link";
import Image from "next/image";
import { useT } from "../../lib/i18n/useT";
import { AdminNavLink } from "./AdminNavLink";
import { LanguageSwitch } from "./LanguageSwitch";
import { ThemeToggle } from "./ThemeToggle";
import { HeaderAuthSlot } from "./HeaderAuthSlot";

export function Header() {
  const t = useT();

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--app-border)] bg-[var(--app-surface)] transition-colors">
      <div className="mx-auto flex h-14 w-full max-w-[82rem] items-center justify-between gap-2 px-2 sm:px-3">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="HairFit Logo"
            width={36}
            height={36}
            className="h-8 w-auto object-contain transition-all dark:brightness-110"
          />
          <span className="text-xl font-black tracking-tighter text-[var(--app-text)]">HairFit</span>
        </Link>

        <nav className="hidden items-center gap-4 text-sm font-semibold md:flex">
          <Link href="/upload" className="text-[var(--app-muted)] hover:text-[var(--app-text)]">
            {t("nav.upload")}
          </Link>
          <Link href="/generate" className="text-[var(--app-muted)] hover:text-[var(--app-text)]">
            {t("nav.generate")}
          </Link>
          <Link href="/mypage" className="text-[var(--app-muted)] hover:text-[var(--app-text)]">
            {t("nav.mypage")}
          </Link>
          <Link href="/salon/customers" className="text-[var(--app-muted)] hover:text-[var(--app-text)]">
            Salon CRM
          </Link>
          <AdminNavLink label="Admin" />

          <div className="flex shrink-0 items-center gap-2">
            <HeaderAuthSlot />
          </div>
          <div className="flex items-center gap-1 border-l border-[var(--app-border)] pl-3">
            <ThemeToggle />
            <LanguageSwitch />
          </div>
        </nav>

        <div className="flex min-w-0 items-center gap-1.5 md:hidden">
          <Link
            href="/upload"
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-4 text-xs font-black uppercase tracking-[0.04em] !text-[var(--app-inverse-text)] transition hover:bg-[var(--app-inverse-muted)]"
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
