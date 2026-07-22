"use client";

import { useState } from "react";
import { MyPageTabNavigation } from "../mypage/MyPageTabNavigation";
import type { MyPageQueryState, MyPageTabId } from "../mypage/myPageTypes";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Surface";

const queryState: MyPageQueryState = {
  checkoutId: "checkout-e2e-tabs",
  payment: "success",
  subscribed: "pro",
};

export function MyPageTabNavigationHarness() {
  const [activeTab, setActiveTab] = useState<MyPageTabId>("usage");

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-10" data-e2e-mypage-tabs="true">
      <Panel as="section" aria-labelledby="mypage-tabs-harness-title" className="space-y-4 p-6">
        <p className="app-kicker">E2E 전용</p>
        <h1 id="mypage-tabs-harness-title" className="text-3xl font-black text-[var(--app-text)]">
          마이페이지 탭 이동 검증
        </h1>
        <p className="text-sm leading-6 text-[var(--app-muted)]">
          결제 복귀 query를 보존하면서 한 개의 Tab 진입점과 화살표·Home·End 이동이 동작하는지 확인합니다.
        </p>
        <div aria-label="활성 탭 시뮬레이션" className="flex flex-wrap gap-2">
          <Button onClick={() => setActiveTab("usage")} type="button" variant="secondary">
            작업 현황 활성화
          </Button>
          <Button onClick={() => setActiveTab("plan")} type="button" variant="secondary">
            플랜/결제 활성화
          </Button>
          <Button onClick={() => setActiveTab("account")} type="button" variant="secondary">
            계정 활성화
          </Button>
        </div>
      </Panel>

      <MyPageTabNavigation activeTab={activeTab} queryState={queryState} />

      <Panel
        aria-labelledby={`mypage-tab-${activeTab}`}
        as="section"
        className="p-5"
        id={`mypage-panel-${activeTab}`}
        role="tabpanel"
      >
        <p className="app-kicker">현재 패널</p>
        <p className="mt-2 text-lg font-black text-[var(--app-text)]">{activeTab} 패널 내용</p>
      </Panel>
    </div>
  );
}
