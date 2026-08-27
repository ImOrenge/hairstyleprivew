"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, type ReactNode } from "react";

export function LoginAuthGate({ children, returnPath }: { children: ReactNode; returnPath: string }) {
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    // A full document request avoids reusing a protected RSC response that may
    // have been prefetched before Clerk finished restoring the browser session.
    window.location.replace(returnPath);
  }, [isLoaded, isSignedIn, returnPath]);

  if (!isLoaded || isSignedIn) {
    return (
      <div className="flex min-h-[18rem] items-center justify-center" role="status" aria-live="polite">
        <p className="text-sm font-semibold text-[var(--app-muted)]">로그인 상태를 확인하고 있습니다.</p>
      </div>
    );
  }

  return children;
}
