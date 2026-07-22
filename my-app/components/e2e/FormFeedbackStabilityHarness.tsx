"use client";

import { useState } from "react";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { InlineAlert } from "../ui/InlineAlert";
import { Panel, SurfaceCard } from "../ui/Surface";

export function FormFeedbackStabilityHarness() {
  const [showEmailError, setShowEmailError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-10">
      <Panel as="section" className="p-6">
        <p className="app-kicker">E2E 전용</p>
        <h1 className="mt-2 text-3xl font-black text-[var(--app-text)]">입력·상태 피드백 안정성 검증</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
          운영 FormField와 InlineAlert의 입력 연결, 오류 공지와 복구 행동을 검증합니다.
        </p>
      </Panel>

      <div className="grid gap-6" data-testid="form-feedback-matrix">
        <SurfaceCard as="section" aria-labelledby="form-field-title" className="grid gap-5 p-5">
          <div className="grid gap-1">
            <h2 id="form-field-title" className="text-lg font-bold text-[var(--app-text)]">FormField 상태</h2>
            <p className="text-sm text-[var(--app-muted)]">라벨·설명·오류·비활성 상태가 하나의 control 계약으로 연결됩니다.</p>
          </div>

          <FormField
            id="e2e-email"
            label="이메일"
            description="완료 알림을 받을 주소를 입력해 주세요."
            error={showEmailError ? "이메일 형식을 확인해 주세요." : undefined}
            required
          >
            {(controlProps) => (
              <input
                {...controlProps}
                className="app-input min-h-11 w-full px-3 py-2"
                placeholder="you@example.com"
                type="email"
              />
            )}
          </FormField>

          <FormField
            id="e2e-salon"
            label="살롱명"
            description="연결된 살롱에서만 수정할 수 있습니다."
            disabled
          >
            {(controlProps) => (
              <input
                {...controlProps}
                className="app-input min-h-11 w-full px-3 py-2"
                defaultValue="테스트 살롱"
              />
            )}
          </FormField>

          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={() => setShowEmailError(true)}>오류 표시</Button>
            <Button type="button" variant="ghost" onClick={() => setShowEmailError(false)}>오류 해제</Button>
          </div>
        </SurfaceCard>

        <SurfaceCard as="section" aria-labelledby="inline-alert-title" className="grid gap-4 p-5">
          <div className="grid gap-1">
            <h2 id="inline-alert-title" className="text-lg font-bold text-[var(--app-text)]">InlineAlert tone</h2>
            <p className="text-sm text-[var(--app-muted)]">일반 상태는 polite, 실패는 assertive로 전달합니다.</p>
          </div>

          <InlineAlert title="생성 작업 접수" tone="info">다른 페이지로 이동해도 서버에서 계속 진행합니다.</InlineAlert>
          <InlineAlert title="저장 완료" tone="success">변경 사항이 안전하게 저장되었습니다.</InlineAlert>
          <InlineAlert title="확인 필요" tone="warning">현재 견적을 확인한 뒤 다음 단계로 이동해 주세요.</InlineAlert>
          <InlineAlert
            title="불러오기 실패"
            tone="danger"
            action={<Button type="button" variant="secondary" onClick={() => setRetryCount((count) => count + 1)}>다시 시도</Button>}
          >
            {retryCount > 0 ? `재시도 ${retryCount}회 요청됨` : "네트워크 연결을 확인한 뒤 다시 시도해 주세요."}
          </InlineAlert>
        </SurfaceCard>
      </div>
    </main>
  );
}
