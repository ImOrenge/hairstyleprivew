"use client";

import { useState } from "react";
import { AsyncBoundary } from "../ui/AsyncBoundary";
import { Button } from "../ui/Button";
import { AppPage, Panel, SurfaceCard } from "../ui/Surface";

export function AsyncBoundaryStabilityHarness() {
  const [actionMessage, setActionMessage] = useState("복구 작업 대기 중");

  return (
    <AppPage className="grid max-w-5xl gap-5 pb-16 pt-8" data-testid="async-boundary-matrix">
      <Panel as="header" className="grid gap-3 p-5 sm:p-6">
        <p className="app-kicker">E2E 전용</p>
        <h1 className="break-keep text-2xl font-black leading-tight text-[var(--app-text)] sm:text-3xl">
          AsyncBoundary 안정성 검증
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-[var(--app-muted)]">
          오류, 로딩, 빈 상태와 준비 완료가 같은 우선순위·라이브 영역·반응형 계약을 유지합니다.
        </p>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <SurfaceCard as="section" aria-labelledby="async-error-title" className="grid gap-3 p-4" data-testid="async-error-card">
          <h2 id="async-error-title" className="font-black text-[var(--app-text)]">오류 우선</h2>
          <AsyncBoundary
            error={new Error("fixture")}
            errorAction={<Button onClick={() => setActionMessage("오류 복구 요청됨")}>다시 시도</Button>}
            errorDescription="입력 내용은 유지됩니다. 연결을 확인하고 다시 시도해 주세요."
            isEmpty
            pending
          >
            <span>표시되지 않아야 하는 준비 상태</span>
          </AsyncBoundary>
        </SurfaceCard>

        <SurfaceCard as="section" aria-labelledby="async-pending-title" className="grid gap-3 p-4" data-testid="async-pending-card">
          <h2 id="async-pending-title" className="font-black text-[var(--app-text)]">로딩 우선</h2>
          <AsyncBoundary
            emptyDescription="표시되지 않아야 하는 빈 상태"
            isEmpty
            loadingDescription="완료되면 같은 위치에 결과가 표시됩니다."
            loadingTitle="스타일 정보를 불러오는 중입니다"
            pending
          >
            <span>표시되지 않아야 하는 준비 상태</span>
          </AsyncBoundary>
        </SurfaceCard>

        <SurfaceCard as="section" aria-labelledby="async-empty-title" className="grid gap-3 p-4" data-testid="async-empty-card">
          <h2 id="async-empty-title" className="font-black text-[var(--app-text)]">빈 상태</h2>
          <AsyncBoundary
            emptyAction={<Button variant="secondary" onClick={() => setActionMessage("새 스타일 시작 선택됨")}>새 스타일 시작</Button>}
            emptyDescription="첫 스타일을 만들면 이 위치에서 이어서 확인할 수 있습니다."
            emptyTitle="아직 표시할 스타일이 없습니다"
            isEmpty
          >
            <span>표시되지 않아야 하는 준비 상태</span>
          </AsyncBoundary>
        </SurfaceCard>

        <SurfaceCard as="section" aria-labelledby="async-ready-title" className="grid gap-3 p-4" data-testid="async-ready-card">
          <h2 id="async-ready-title" className="font-black text-[var(--app-text)]">준비 완료</h2>
          <AsyncBoundary>
            <div className="rounded-[var(--app-radius-card)] border border-[var(--app-border)] bg-[var(--app-surface)] p-4" data-testid="async-ready-content">
              <p className="font-black text-[var(--app-text)]">스타일 데이터 준비 완료</p>
              <p className="mt-1 text-sm text-[var(--app-muted)]">자식 콘텐츠는 불필요한 wrapper 없이 그대로 렌더링됩니다.</p>
            </div>
          </AsyncBoundary>
        </SurfaceCard>
      </div>

      <p aria-live="polite" className="text-sm font-bold text-[var(--app-text)]" data-testid="async-action-status" role="status">
        {actionMessage}
      </p>
    </AppPage>
  );
}
