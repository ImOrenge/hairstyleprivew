"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useClerkAvailable } from "../providers/ClerkAvailabilityProvider";

interface OnboardingResponse {
  accountType?: string | null;
}

interface AdminNavLinkProps {
  className?: string;
  label?: string;
}

const defaultClassName = "text-[var(--app-muted)] hover:text-[var(--app-text)]";

function AdminNavLinkWithClerk({
  className = defaultClassName,
  label = "Admin",
}: AdminNavLinkProps) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [verifiedAccountType, setVerifiedAccountType] = useState<string | null>(null);
  const metadataAccountType = user?.publicMetadata?.accountType;
  const isAdmin = Boolean(
    isLoaded &&
      isSignedIn &&
      (metadataAccountType === "admin" || verifiedAccountType === "admin"),
  );

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      return;
    }

    let mounted = true;

    async function loadRole() {
      const response = await fetch("/api/onboarding", { cache: "no-store" });
      if (!mounted || !response.ok) {
        return;
      }

      const data = (await response.json().catch(() => null)) as OnboardingResponse | null;
      if (!mounted || !data) {
        return;
      }

      setVerifiedAccountType(data.accountType ?? null);
    }

    void loadRole();
    return () => {
      mounted = false;
    };
  }, [isLoaded, isSignedIn, user?.id]);

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
  const hasClerkProvider = useClerkAvailable();

  if (!hasClerkProvider) {
    return null;
  }

  return <AdminNavLinkWithClerk {...props} />;
}
