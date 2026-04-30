"use client";

import { SignOutButton, useAuth, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import type { MouseEventHandler } from "react";
import { useT } from "../../lib/i18n/useT";
import { loginButtonClassName, signupButtonClassName } from "./authButtonStyles";
import { useHeaderAccount } from "./HeaderAccountContext";

export function ClerkAuthButtons() {
  const { isLoaded, isSignedIn } = useAuth();

  if (isLoaded && isSignedIn) {
    return <UserButton />;
  }

  return <AuthLinks />;
}

export function MobileClerkAuthButtons() {
  const { isLoaded, isSignedIn } = useAuth();
  const { accountHomeHref, isRoleLoaded } = useHeaderAccount();

  if (isLoaded && isSignedIn) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <Link
          href={isRoleLoaded ? accountHomeHref : "/onboarding"}
          className="inline-flex min-w-[56px] items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.04em] text-[var(--app-text)] transition hover:bg-[var(--app-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
        >
          내 계정
        </Link>
        <SignOutButton>
          <button
            type="button"
            className="inline-flex min-w-[68px] items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.04em] text-[var(--app-inverse-text)] transition hover:bg-[var(--app-inverse-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
          >
            로그아웃
          </button>
        </SignOutButton>
      </div>
    );
  }

  return (
    <Link href="/login" className={loginButtonClassName}>
      로그인
    </Link>
  );
}

interface MobileSignupMenuLinkProps {
  className: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

export function MobileClerkSignupMenuLink({ className, onClick }: MobileSignupMenuLinkProps) {
  const { isLoaded, isSignedIn } = useAuth();
  const t = useT();

  if (isLoaded && isSignedIn) {
    return null;
  }

  return (
    <Link href="/signup" onClick={onClick} className={className}>
      {t("nav.signup")}
    </Link>
  );
}

export function AuthLinks() {
  const t = useT();

  return (
    <>
      <Link href="/login" className={loginButtonClassName}>
        {t("nav.login")}
      </Link>
      <Link href="/signup" className={signupButtonClassName}>
        {t("nav.signup")}
      </Link>
    </>
  );
}
