"use client";

import { getGenerationJobProgressPresentation } from "@hairfit/shared";
import { useState } from "react";
import {
  WorkspaceStepNavigation,
  type WorkspaceWizardStep,
} from "../workspace/WorkspaceStepNavigation";
import { WorkspaceAcceptedGenerationStatus } from "../workspace/WorkspaceAcceptedGenerationStatus";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Surface";

const acceptedProgress = getGenerationJobProgressPresentation({
  status: "queued",
  acceptedAt: "2026-07-19T00:00:00.000Z",
  preparationStatus: "queued",
  workflowDispatchStatus: "queued",
});

export function WorkspaceFlowHarness() {
  const [currentStep, setCurrentStep] = useState<WorkspaceWizardStep>("upload");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [stepsUnlocked, setStepsUnlocked] = useState(false);
  const [actionMessage, setActionMessage] = useState("아직 실행한 작업이 없습니다.");

  const selectStep = (step: WorkspaceWizardStep) => {
    setCurrentStep(step);
    setActionMessage(`${step} 단계를 열었습니다.`);
  };

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-5 px-4 py-10 pb-32 md:pb-10">
      <Panel as="section" className="space-y-4 p-5">
        <p className="app-kicker">E2E 전용</p>
        <h1 className="text-3xl font-black text-[var(--app-text)]">생성 마법사 단계 검증</h1>
        <p className="text-sm leading-6 text-[var(--app-muted)]">
          사진 업로드부터 접수 후 진행 확인까지 운영 컴포넌트의 잠금·단계 이동·완료 안내를 검증합니다.
        </p>
        <Button
          type="button"
          variant="secondary"
          aria-pressed={stepsUnlocked}
          onClick={() => setStepsUnlocked((value) => !value)}
        >
          {stepsUnlocked ? "후속 단계 다시 잠그기" : "사진 검증 완료로 단계 열기"}
        </Button>
      </Panel>

      <WorkspaceStepNavigation
        canOpenGenerate={stepsUnlocked}
        canOpenProgress={stepsUnlocked}
        canOpenSelect={stepsUnlocked}
        currentStep={currentStep}
        mobileOpen={mobileOpen}
        onStepClick={selectStep}
        onToggleMobile={() => setMobileOpen((value) => !value)}
      />

      {currentStep === "progress" ? (
        <WorkspaceAcceptedGenerationStatus
          acceptedProgress={acceptedProgress}
          reservedCredits={10}
          onShowStatus={() => setActionMessage("작업 현황을 열었습니다.")}
          onShowHome={() => setActionMessage("홈으로 이동했습니다.")}
          onResetPhoto={() => {
            setCurrentStep("upload");
            setStepsUnlocked(false);
            setActionMessage("새 사진 업로드 단계로 돌아왔습니다.");
          }}
        />
      ) : (
        <Panel as="section" className="p-5" aria-label="현재 단계 안내">
          <p className="text-sm font-black text-[var(--app-text)]">
            현재 {currentStep === "upload" ? "1단계 · 사진 업로드" : `${currentStep} 단계`}입니다.
          </p>
        </Panel>
      )}

      <p role="status" aria-live="polite" aria-atomic="true" className="text-sm text-[var(--app-muted)]">
        {actionMessage}
      </p>
    </main>
  );
}
