"use client";

import { useState } from "react";
import { Button } from "../ui/Button";
import { Panel, SurfaceCard } from "../ui/Surface";

export function ButtonStabilityHarness() {
  const [activationCount, setActivationCount] = useState(0);

  const countActivation = () => setActivationCount((count) => count + 1);

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-10">
      <Panel as="section" className="p-6">
        <p className="app-kicker">E2E 전용</p>
        <h1 className="mt-2 text-3xl font-black text-[var(--app-text)]">Button 안정성 검증</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
          운영 Button의 variant, 키보드 활성화, 비활성화와 처리 중 상태를 검증합니다.
        </p>
      </Panel>

      <SurfaceCard
        as="section"
        aria-labelledby="button-variants-title"
        className="grid gap-5 p-5"
        data-testid="button-stability-matrix"
      >
        <div className="grid gap-1">
          <h2 id="button-variants-title" className="text-lg font-bold text-[var(--app-text)]">
            상태와 variant
          </h2>
          <p className="text-sm text-[var(--app-muted)]">모든 버튼은 같은 토큰·포커스·상태 계약을 사용합니다.</p>
        </div>

        <div className="flex flex-wrap gap-3" aria-label="활성 버튼">
          <Button data-testid="button-primary" onClick={countActivation}>기본 실행</Button>
          <Button variant="secondary">보조 실행</Button>
          <Button variant="ghost">낮은 우선순위</Button>
        </div>

        <div className="rounded-[var(--app-radius-card)] bg-[var(--app-inverse)] p-4">
          <Button variant="inverse">반전 표면 실행</Button>
        </div>

        <div className="flex flex-wrap gap-3" aria-label="비활성 및 처리 상태">
          <Button disabled onClick={countActivation}>사용할 수 없음</Button>
          <Button aria-disabled="true" onClick={countActivation} variant="secondary">권한으로 비활성</Button>
          <Button loading loadingLabel="저장하는 중…" onClick={countActivation}>저장</Button>
        </div>

        <p aria-live="polite" className="text-sm font-semibold text-[var(--app-text)]" role="status">
          실행 횟수 {activationCount}
        </p>
      </SurfaceCard>
    </main>
  );
}
