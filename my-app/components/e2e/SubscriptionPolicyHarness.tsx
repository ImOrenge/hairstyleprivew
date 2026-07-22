"use client";

import { useState } from "react";
import { SubscriptionPolicyDisclosure } from "../billing/SubscriptionPolicyDisclosure";
import { Button } from "../ui/Button";
import { Panel, SurfaceCard } from "../ui/Surface";

export function SubscriptionPolicyHarness() {
  const [compact, setCompact] = useState(false);

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-10">
      <Panel as="section" aria-labelledby="subscription-policy-harness-title" className="space-y-4 p-6">
        <p className="app-kicker">E2E 전용</p>
        <h1 id="subscription-policy-harness-title" className="text-3xl font-black text-[var(--app-text)]">
          정기결제 정책 표시 검증
        </h1>
        <p className="text-sm leading-6 text-[var(--app-muted)]">
          결제 전에 자동결제, 크레딧 지급, 잔액 유지, 기간 종료 해지를 읽고 관련 정책으로 이동할 수 있는지 확인합니다.
        </p>
        <div aria-label="정책 표시 밀도" className="flex flex-wrap gap-2">
          <Button
            aria-pressed={!compact}
            onClick={() => setCompact(false)}
            type="button"
            variant={!compact ? "primary" : "secondary"}
          >
            기본 보기
          </Button>
          <Button
            aria-pressed={compact}
            onClick={() => setCompact(true)}
            type="button"
            variant={compact ? "primary" : "secondary"}
          >
            간단히 보기
          </Button>
        </div>
      </Panel>

      <SurfaceCard className="p-4 sm:p-5">
        <SubscriptionPolicyDisclosure compact={compact} />
      </SurfaceCard>
    </main>
  );
}
