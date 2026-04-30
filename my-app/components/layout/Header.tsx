"use client";

import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { HeaderAccountProvider } from "./HeaderAccountContext";
import { HeaderRoleNavLinks } from "./HeaderRoleNavLinks";
import { LanguageSwitch } from "./LanguageSwitch";
import { ThemeToggle } from "./ThemeToggle";
import { HeaderAuthSlot, MobileHeaderAuthSlot, MobileSignupMenuLink } from "./HeaderAuthSlot";

export function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const closeMobileMenu = () => setIsMobileMenuOpen(false);
  const mobileMenuLinkClassName =
    "rounded-[var(--app-radius-control)] px-3 py-2.5 text-[var(--app-muted)] transition hover:bg-[var(--app-surface-muted)] hover:text-[var(--app-text)]";

  return (
    <HeaderAccountProvider>
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
            <HeaderRoleNavLinks />

            <div className="flex shrink-0 items-center gap-2">
              <HeaderAuthSlot />
            </div>
            <div className="flex items-center gap-1 border-l border-[var(--app-border)] pl-3">
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
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border)] text-[var(--app-text)] transition hover:bg-[var(--app-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
            >
              {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {isMobileMenuOpen ? (
          <div className="border-t border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.10)] md:hidden">
            <nav className="mx-auto flex w-full max-w-[82rem] flex-col gap-1 text-sm font-semibold">
              <HeaderRoleNavLinks className={mobileMenuLinkClassName} onClick={closeMobileMenu} />
              <MobileSignupMenuLink className={mobileMenuLinkClassName} onClick={closeMobileMenu} />
              <div className="mt-2 flex items-center justify-between border-t border-[var(--app-border)] px-3 pt-3">
                <span className="text-xs font-bold uppercase tracking-[0.04em] text-[var(--app-muted)]">
                  Settings
                </span>
                <div className="flex items-center gap-1">
                  <ThemeToggle />
                  <LanguageSwitch />
                </div>
              </div>
            </nav>
          </div>
        ) : null}
      </header>
    </HeaderAccountProvider>
  );
}
