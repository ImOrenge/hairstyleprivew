"use client";

import { useState } from "react";
import { SubscriptionWaitlistForm } from "../payments/SubscriptionWaitlistForm";
import { Panel, SurfaceCard } from "../ui/Surface";

export function SubscriptionWaitlistHarness() {
  const [submittedCount, setSubmittedCount] = useState(0);

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10">
      <Panel as="section" aria-labelledby="subscription-waitlist-harness-title" className="space-y-4 p-6">
        <p className="app-kicker">E2E 전용</p>
        <h1 id="subscription-waitlist-harness-title" className="text-3xl font-black text-[var(--app-text)]">
          구독 오픈 알림 신청 검증
        </h1>
        <p className="text-sm leading-6 text-[var(--app-muted)]">
          이메일 검증, 제출 중 잠금, 성공·중복 신청·요청 제한 복구를 실제 신청 폼으로 확인합니다.
        </p>
      </Panel>

      <SurfaceCard className="p-4 sm:p-6">
        <SubscriptionWaitlistForm
          onSubmitted={() => setSubmittedCount((count) => count + 1)}
          sourcePath="/e2e-harness/subscription-waitlist?from=stability"
        />
      </SurfaceCard>

      <p aria-atomic="true" aria-live="polite" className="text-sm text-[var(--app-muted)]" role="status">
        완료된 신청 {submittedCount}회
      </p>
    </main>
  );
}
