"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface OnboardingResponse {
  accountType?: string | null;
}

export function AdminNavLink() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
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

      setIsAdmin(data.accountType === "admin");
    }

    void loadRole();
    return () => {
      mounted = false;
    };
  }, []);

  if (!isAdmin) {
    return null;
  }

  return (
    <Link href="/admin/stats" className="text-stone-600 hover:text-black dark:text-zinc-400 dark:hover:text-white">
      Admin
    </Link>
  );
}

