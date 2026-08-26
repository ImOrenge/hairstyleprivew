"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState, type ReactNode } from "react";

const AUTH_RESUME_WINDOW_MS = 15_000;

export function LoginAuthGate({ children, returnPath }: { children: ReactNode; returnPath: string }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [resumeBlocked, setResumeBlocked] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    const resumeKey = `hairfit:auth-resume:${returnPath}`;
    try {
      const now = Date.now();
      const previousAttempt = Number(window.sessionStorage.getItem(resumeKey));
      if (Number.isFinite(previousAttempt) && now - previousAttempt < AUTH_RESUME_WINDOW_MS) {
        const recoveryTimer = window.setTimeout(() => setResumeBlocked(true), 0);
        return () => window.clearTimeout(recoveryTimer);
      }
      window.sessionStorage.setItem(resumeKey, String(now));
    } catch {
      // A full document navigation is still the safest fallback when storage is unavailable.
    }

    // A full document request avoids reusing a protected RSC response that may
    // have been prefetched before Clerk finished restoring the browser session.
    window.location.replace(returnPath);
  }, [isLoaded, isSignedIn, returnPath]);

  if (resumeBlocked) {
    return (
      <div className="grid min-h-[18rem] content-center gap-4 text-center" role="alert">
        <div>
          <h1 className="text-xl font-black text-[var(--app-text)]">로그인은 완료되었습니다</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
            이전 상담 이동 응답을 다시 사용하지 않도록 연결을 멈췄습니다. 아래 버튼으로 새 요청을 보내 주세요.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <a className="f-landing-cta" href={returnPath}>상담 다시 열기</a>
          <a className="f-landing-ghost-cta" href="/home">홈으로 이동</a>
        </div>
      </div>
    );
  }

  if (!isLoaded || isSignedIn) {
    return (
      <div className="flex min-h-[18rem] items-center justify-center" role="status" aria-live="polite">
        <p className="text-sm font-semibold text-[var(--app-muted)]">로그인 상태를 확인하고 있습니다.</p>
      </div>
    );
  }

  return children;
}
