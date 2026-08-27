"use client";

import Image from "next/image";
import Link from "next/link";
import {
  BookHeart,
  HeartPulse,
  Home,
  Plus,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  CUSTOMER_NAVIGATION_ITEMS,
  isCustomerNavigationItemActive,
} from "../../lib/customer-navigation";

const navigationIcons: Record<(typeof CUSTOMER_NAVIGATION_ITEMS)[number]["label"], LucideIcon> = {
  홈: Home,
  스타일북: BookHeart,
  "새 컨설팅": Plus,
  케어: HeartPulse,
  "내 정보": UserRound,
};

export function CustomerShell({ children, activePath }: { children: ReactNode; activePath?: string }) {
  const pathname = usePathname();
  const currentPath = activePath ?? pathname;

  return (
    <div className="customer-app">
      <aside className="customer-app__rail" aria-label="고객 주요 내비게이션">
        <Link href="/home" prefetch={activePath ? false : undefined} className="customer-app__brand" aria-label="HairFit 고객 홈">
          <span className="customer-app__brand-mark" aria-hidden="true">
            <Image src="/logo.png" alt="" width={40} height={40} priority />
          </span>
          <span className="customer-app__brand-copy">
            <strong>HairFit</strong>
            <small>Private AI Atelier</small>
          </span>
        </Link>

        <nav className="customer-app__navigation">
          {CUSTOMER_NAVIGATION_ITEMS.map((item) => {
            const Icon = navigationIcons[item.label];
            const active = isCustomerNavigationItemActive(currentPath, item.href);
            const action = "action" in item && item.action;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={activePath ? false : undefined}
                aria-current={active ? "page" : undefined}
                className={action ? "customer-app__nav-item customer-app__nav-action" : "customer-app__nav-item"}
              >
                <span className="customer-app__nav-icon" aria-hidden="true">
                  <Icon />
                </span>
                <span className="customer-app__nav-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <p className="customer-app__rail-note">
          <Sparkles aria-hidden="true" />
          나만의 스타일 기록을 한곳에서 관리해요.
        </p>
      </aside>

      <div className="customer-app__content">{children}</div>

      <nav className="customer-app__bottom-nav" aria-label="고객 주요 내비게이션">
        {CUSTOMER_NAVIGATION_ITEMS.map((item) => {
          const Icon = navigationIcons[item.label];
          const active = isCustomerNavigationItemActive(currentPath, item.href);
          const action = "action" in item && item.action;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={activePath ? false : undefined}
              aria-current={active ? "page" : undefined}
              className={action ? "customer-app__bottom-item customer-app__bottom-action" : "customer-app__bottom-item"}
            >
              <span aria-hidden="true">
                <Icon />
              </span>
              <small>{item.label}</small>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function CustomerPageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="customer-page-header">
      <div>
        <p className="customer-kicker">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? <div className="customer-page-header__action">{action}</div> : null}
    </header>
  );
}
