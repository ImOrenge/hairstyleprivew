"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export function MobileStickyCtaBar() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const hero = document.querySelector("#home-hero");
    if (!hero) return;

    const closingTargets = [
      document.querySelector(".f-premium-final"),
      document.querySelector("footer"),
    ].filter((target): target is Element => target !== null);
    const visibleClosingTargets = new Set<Element>();
    let heroIsVisible = true;

    const syncVisibility = () => {
      setIsVisible(!heroIsVisible && visibleClosingTargets.size === 0);
    };

    const heroObserver = new IntersectionObserver(
      ([entry]) => {
        heroIsVisible = entry.isIntersecting;
        syncVisibility();
      },
      { threshold: 0.05 },
    );
    const closingObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visibleClosingTargets.add(entry.target);
          else visibleClosingTargets.delete(entry.target);
        }
        syncVisibility();
      },
      { threshold: 0.01 },
    );

    heroObserver.observe(hero);
    for (const target of closingTargets) closingObserver.observe(target);

    return () => {
      heroObserver.disconnect();
      closingObserver.disconnect();
    };
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
