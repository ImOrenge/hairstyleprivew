"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

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
      className="f-landing-sticky-cta"
      data-visible={isVisible}
      aria-hidden={!isVisible}
    >
      <Link
      href="/consulting/new"
        tabIndex={isVisible ? undefined : -1}
        className="f-landing-sticky-cta__action"
      >
        프라이빗 컨설팅 시작
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
