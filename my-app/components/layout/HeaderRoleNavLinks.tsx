"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

export function isCurrentNavigationPath(pathname: string, href: string) {
  const hrefPathname = href.split(/[?#]/, 1)[0] || "/";

  return pathname === hrefPathname || (hrefPathname !== "/" && pathname.startsWith(`${hrefPathname}/`));
}

function getCompleteNavItems(accountType: AccountType | null, t: ReturnType<typeof useT>): HeaderNavItem[] {
  if (accountType === "member") {
    return [
      { href: "/home", label: "홈" },
      { href: "/mypage", label: t("nav.mypage") },
    ];
  }

  if (accountType === "salon_owner") {
    return [{ href: "/salon/customers", label: "Salon CRM" }];
  }

  if (accountType === "admin") {
    return [
      { href: "/admin/stats", label: "Admin" },
      { href: "/home", label: "고객 홈" },
      { href: "/mypage", label: t("nav.mypage") },
      { href: "/salon/customers", label: "Salon CRM" },
    ];
  }

  return [{ href: "/home", label: "홈" }];
}

function getSetupNavItems(): HeaderNavItem[] {
  return [
    { href: "/home", label: "홈" },
    { href: "/mypage?tab=account&setup=1", label: "계정 설정" },
  ];
}

export function HeaderRoleNavLinks({
  className = defaultClassName,
  onClick,
}: HeaderRoleNavLinksProps) {
  const t = useT();
  const pathname = usePathname();
  const { isSignedIn, isRoleLoaded, accountType, accountSetupComplete } = useHeaderAccount();

  if (!isSignedIn || !isRoleLoaded) {
    return null;
  }

  const navItems = accountSetupComplete ? getCompleteNavItems(accountType, t) : getSetupNavItems();

  return (
    <>
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onClick}
          className={className}
          aria-current={isCurrentNavigationPath(pathname, item.href) ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </>
  );
}
