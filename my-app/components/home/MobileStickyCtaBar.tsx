"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function MobileStickyCtaBar() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const hero = document.querySelector("#home-hero");
    if (!hero) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(!entry.isIntersecting),
      { threshold: 0.05 },
    );
    observer.observe(hero);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-2 transition duration-300 lg:hidden ${
        isVisible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
      }`}
      aria-hidden={!isVisible}
    >
      <Link
      href="/consulting/new"
        tabIndex={isVisible ? undefined : -1}
        className="flex w-full items-center justify-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-5 py-3 text-sm font-bold uppercase tracking-[0.04em] !text-[var(--app-inverse-text)] transition hover:bg-[var(--app-inverse-muted)]"
      >
        무료로 내 스타일 보기
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
