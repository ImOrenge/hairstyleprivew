"use client";

import Link from "next/link";
import { useHeaderAccount } from "./HeaderAccountContext";

interface AdminNavLinkProps {
  className?: string;
  label?: string;
}

const defaultClassName = "text-stone-600 hover:text-black dark:text-zinc-400 dark:hover:text-white";

function AdminNavLinkWithClerk({
  className = defaultClassName,
  label = "Admin",
}: AdminNavLinkProps) {
  const { isSignedIn, isRoleLoaded, accountType, onboardingComplete } = useHeaderAccount();
  const isAdmin = Boolean(isSignedIn && isRoleLoaded && onboardingComplete && accountType === "admin");

  if (!isAdmin) {
    return null;
  }

  return (
    <Link href="/admin/stats" className={className}>
      {label}
    </Link>
  );
}

export function AdminNavLink(props: AdminNavLinkProps) {
  return <AdminNavLinkWithClerk {...props} />;
}
