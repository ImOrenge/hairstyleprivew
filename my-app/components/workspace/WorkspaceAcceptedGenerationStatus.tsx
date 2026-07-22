"use client";

import type { GenerationJobProgressPresentation } from "@hairfit/shared";
import { CheckCircle2 } from "lucide-react";
import { GenerationJobProgressCard } from "../generate/GenerationJobProgressCard";
import { Button } from "../ui/Button";
import { Panel, SurfaceCard } from "../ui/Surface";

export interface WorkspaceAcceptedGenerationStatusProps {
  acceptedProgress: GenerationJobProgressPresentation;
  onResetPhoto: () => void;
  onShowHome: () => void;
  onShowStatus: () => void;
  reservedCredits: number | null;
}

export function WorkspaceAcceptedGenerationStatus({
  acceptedProgress,
  onResetPhoto,
  onShowHome,
  onShowStatus,
  reservedCredits,
}: WorkspaceAcceptedGenerationStatusProps) {
  return (
    <Panel
      as="section"
      className="c-workspace-accepted-status"
      data-reserved-credits={reservedCredits === null ? "unknown" : "confirmed"}
      aria-labelledby="workspace-accepted-status-title"
    >
      <div className="c-workspace-accepted-status__content">
        <div
          className="c-workspace-accepted-status__header"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="c-workspace-accepted-status__icon">
            <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="c-workspace-accepted-status__copy">
            <p className="app-kicker">3단계 · 생성 진행·알림</p>
            <h2 id="workspace-accepted-status-title" className="c-workspace-accepted-status__title">
              백그라운드 생성이 시작되었습니다
            </h2>
            <p className="c-workspace-accepted-status__description">
              접수 영수증을 확인했습니다. 이제 다른 페이지로 이동하거나 브라우저를 닫아도 서버에서 헤어스타일 생성을 계속합니다.
            </p>
          </div>
        </div>

        <GenerationJobProgressCard presentation={acceptedProgress} />

        <SurfaceCard className="c-workspace-accepted-status__notification">
          <p className="text-sm font-black text-[var(--app-text)]">완료 알림을 보내드립니다</p>
          <p className="text-sm leading-6 text-[var(--app-muted)]">
            생성이 끝나면 가입 이메일로 알려드립니다. 진행 상태는 마이페이지의 작업 현황에서도 다시 확인할 수 있습니다.
          </p>
          {reservedCredits !== null ? (
            <p className="text-xs font-semibold text-[var(--app-text)]">
              {reservedCredits}크레딧 예약도 함께 완료되었습니다.
            </p>
          ) : null}
        </SurfaceCard>

        <div className="c-workspace-accepted-status__actions">
          <Button type="button" onClick={onShowStatus}>
            작업 현황 보기
          </Button>
          <Button type="button" variant="secondary" onClick={onShowHome}>
            홈으로 이동
          </Button>
          <Button type="button" variant="ghost" onClick={onResetPhoto}>
            새 사진으로 생성
          </Button>
        </div>
      </div>
    </Panel>
  );
}
