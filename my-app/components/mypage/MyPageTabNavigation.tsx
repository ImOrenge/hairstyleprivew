"use client";

import Link from "next/link";
import { type KeyboardEvent, useRef } from "react";
import {
  Activity,
  CreditCard,
  Palette,
  Scissors,
  Shirt,
  UserRound,
} from "lucide-react";
import { Panel } from "../ui/Surface";
import { buildMyPageTabHref } from "./myPageRoutes";
import type { MyPageQueryState, MyPageTabId } from "./myPageTypes";

const tabs: {
  description: string;
  icon: typeof Activity;
  id: MyPageTabId;
  label: string;
}[] = [
  { id: "usage", label: "작업 현황", description: "생성 진행 상태", icon: Activity },
  { id: "plan", label: "플랜/결제", description: "구독과 결제", icon: CreditCard },
  { id: "aftercare", label: "시술 확정", description: "확정 스타일 목록", icon: Scissors },
  { id: "personal-color", label: "퍼스널컬러", description: "컬러 상세 분석", icon: Palette },
  { id: "body-profile", label: "바디프로필", description: "패션 추천 설정", icon: Shirt },
  { id: "account", label: "계정", description: "기본 정보", icon: UserRound },
];

export interface MyPageTabNavigationProps {
  activeTab: MyPageTabId;
  queryState: MyPageQueryState;
}

export function MyPageTabNavigation({
  activeTab,
  queryState,
}: MyPageTabNavigationProps) {
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLAnchorElement>,
    index: number,
  ) {
    let targetIndex: number | null = null;

    if (event.key === "ArrowRight") {
      targetIndex = (index + 1) % tabs.length;
    } else if (event.key === "ArrowLeft") {
      targetIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      targetIndex = 0;
    } else if (event.key === "End") {
      targetIndex = tabs.length - 1;
    }

    if (targetIndex === null) return;
    event.preventDefault();
    tabRefs.current[targetIndex]?.focus();
  }

  return (
    <Panel
      as="nav"
      aria-label="마이페이지 탭"
      className="c-mypage-tab-navigation relative z-10 min-w-0 max-w-full overflow-hidden p-1.5 sm:p-2"
      data-active-tab={activeTab}
    >
      <div
        role="tablist"
        aria-label="마이페이지 섹션"
        aria-orientation="horizontal"
        className="flex w-full min-w-0 max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] md:pb-0 [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab, index) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <Link
              key={tab.id}
              id={`mypage-tab-${tab.id}`}
              role="tab"
              aria-current={active ? "page" : undefined}
              aria-selected={active}
              aria-controls={active ? `mypage-panel-${tab.id}` : undefined}
              data-state={active ? "active" : "inactive"}
              href={buildMyPageTabHref(tab.id, queryState)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              tabIndex={active ? 0 : -1}
              className={`flex min-h-11 min-w-max shrink-0 items-center gap-2 rounded-[var(--app-radius-control)] border px-3 py-2 text-left transition sm:min-h-12 sm:px-4 ${
                active
                  ? "border-[var(--app-border-strong)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)]"
                  : "border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-muted)]"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="block whitespace-nowrap text-sm font-black">
                  {tab.label}
                </span>
                <span
                  className={`hidden whitespace-nowrap text-xs sm:block ${
                    active ? "text-white/70" : "text-[var(--app-muted)]"
                  }`}
                >
                  {tab.description}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </Panel>
  );
}
