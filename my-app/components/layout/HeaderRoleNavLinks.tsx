"use client";

import Link from "next/link";
import type { MouseEventHandler } from "react";
import type { AccountType } from "../../lib/onboarding";
import { useT } from "../../lib/i18n/useT";
import { useHeaderAccount } from "./HeaderAccountContext";

interface HeaderRoleNavLinksProps {
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

interface HeaderNavItem {
  href: string;
  label: string;
}

const defaultClassName = "text-[var(--app-muted)] hover:text-[var(--app-text)]";

function getNavItems(accountType: AccountType | null, t: ReturnType<typeof useT>): HeaderNavItem[] {
  if (accountType === "member") {
    return [
      { href: "/upload", label: t("nav.upload") },
      { href: "/generate", label: t("nav.generate") },
      { href: "/mypage", label: t("nav.mypage") },
    ];
  }

  if (accountType === "salon_owner") {
    return [{ href: "/salon/customers", label: "Salon CRM" }];
  }

  if (accountType === "admin") {
    return [{ href: "/admin/stats", label: "Admin" }];
  }

  return [{ href: "/onboarding", label: "계정 설정" }];
}

export function HeaderRoleNavLinks({
  className = defaultClassName,
  onClick,
}: HeaderRoleNavLinksProps) {
  const t = useT();
  const { isSignedIn, isRoleLoaded, accountType, onboardingComplete } = useHeaderAccount();

  if (!isSignedIn || !isRoleLoaded) {
    return null;
  }

  const navItems = onboardingComplete ? getNavItems(accountType, t) : getNavItems(null, t);

  return (
    <>
      {navItems.map((item) => (
        <Link key={item.href} href={item.href} onClick={onClick} className={className}>
          {item.label}
        </Link>
      ))}
    </>
  );
}
