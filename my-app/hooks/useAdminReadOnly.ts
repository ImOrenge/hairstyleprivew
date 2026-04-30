"use client";

import { useEffect, useState } from "react";

interface OnboardingResponse {
  accountType?: string | null;
}

export function useAdminReadOnly() {
  const [isAdminReadOnly, setIsAdminReadOnly] = useState(false);
  const [isRoleLoaded, setIsRoleLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadRole() {
      try {
        const response = await fetch("/api/onboarding", { cache: "no-store" });
        const data = (await response.json().catch(() => null)) as OnboardingResponse | null;
        if (mounted) {
          setIsAdminReadOnly(response.ok && data?.accountType === "admin");
        }
      } catch {
        if (mounted) {
          setIsAdminReadOnly(false);
        }
      } finally {
        if (mounted) {
          setIsRoleLoaded(true);
        }
      }
    }

    void loadRole();

    return () => {
      mounted = false;
    };
  }, []);

  return { isAdminReadOnly, isRoleLoaded };
}
