"use client";

import {
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  ImagePlus,
  Sparkles,
  Wand2,
  type LucideIcon,
} from "lucide-react";

export type WorkspaceWizardStep = "upload" | "generate" | "progress" | "select";

interface WorkspaceStepDefinition {
  id: WorkspaceWizardStep;
  label: string;
  description: string;
  icon: LucideIcon;
}

const workspaceSteps: WorkspaceStepDefinition[] = [
  {
    id: "upload",
    label: "사진 업로드",
    description: "정면 사진을 검증합니다",
    icon: ImagePlus,
  },
  {
    id: "generate",
    label: "생성 접수",
    description: "사진과 비용을 확인해 접수합니다",
    icon: Wand2,
  },
  {
    id: "progress",
    label: "생성 진행·알림",
    description: "서버 작업 상태와 완료 알림을 확인합니다",
    icon: Sparkles,
  },
  {
    id: "select",
    label: "헤어 선택",
    description: "완료된 결과를 저장하고 이어갑니다",
    icon: ClipboardCheck,
  },
];

export interface WorkspaceStepNavigationProps {
  canOpenGenerate: boolean;
  canOpenProgress: boolean;
  canOpenSelect: boolean;
  currentStep: WorkspaceWizardStep;
  mobileOpen: boolean;
  onStepClick: (step: WorkspaceWizardStep) => void;
  onToggleMobile: () => void;
}

function isStepEnabled(
  step: WorkspaceWizardStep,
  availability: Pick<
    WorkspaceStepNavigationProps,
    "canOpenGenerate" | "canOpenProgress" | "canOpenSelect"
  >,
) {
  if (step === "upload") return true;
  if (step === "generate") return availability.canOpenGenerate;
  if (step === "progress") return availability.canOpenProgress;
  return availability.canOpenSelect;
}

function StepButton({
  currentStep,
  enabled,
  onClick,
  position,
  step,
}: {
  currentStep: WorkspaceWizardStep;
  enabled: boolean;
  onClick: (step: WorkspaceWizardStep) => void;
  position: number;
  step: WorkspaceStepDefinition;
}) {
  const active = currentStep === step.id;
  const Icon = step.icon;

  return (
    <button
      type="button"
      onClick={() => onClick(step.id)}
      disabled={!enabled}
      className="c-workspace-step-navigation__step"
      data-active={active ? "true" : "false"}
      data-enabled={enabled ? "true" : "false"}
      aria-current={active ? "step" : undefined}
      aria-label={`${position}단계 ${step.label}: ${step.description}`}
    >
      <span className="c-workspace-step-navigation__step-icon">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="c-workspace-step-navigation__step-copy">
        <span className="c-workspace-step-navigation__step-label">
          <span aria-hidden="true">{position}.</span> {step.label}
        </span>
        <span className="c-workspace-step-navigation__step-description">
          {step.description}
        </span>
      </span>
    </button>
  );
}

function MobileStepOverlay({
  canOpenGenerate,
  canOpenProgress,
  canOpenSelect,
  currentStep,
  isOpen,
  onStepClick,
  onToggle,
}: Omit<WorkspaceStepNavigationProps, "mobileOpen" | "onToggleMobile"> & {
  isOpen: boolean;
  onToggle: () => void;
}) {
  const activeIndex = Math.max(
    workspaceSteps.findIndex((step) => step.id === currentStep),
    0,
  );
  const activeStep = workspaceSteps[activeIndex] || workspaceSteps[0];
  const ActiveIcon = activeStep.icon;
  const activeProgress = Math.round(((activeIndex + 1) / workspaceSteps.length) * 100);
  const availability = { canOpenGenerate, canOpenProgress, canOpenSelect };

  return (
    <div
      className="c-workspace-step-navigation"
      data-layout="mobile"
      data-open={isOpen ? "true" : "false"}
    >
      <div className="c-workspace-step-navigation__backdrop" aria-hidden="true" />
      <div className="c-workspace-step-navigation__mobile-safe-area">
        <div className="c-workspace-step-navigation__mobile-panel">
          {isOpen ? (
            <div id="workspace-mobile-steps" className="c-workspace-step-navigation__mobile-menu">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="app-kicker">진행 단계</p>
                  <p id="workspace-mobile-steps-title" className="mt-1 text-sm font-black text-[var(--app-text)]">
                    전체 생성 단계
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onToggle}
                  className="c-workspace-step-navigation__menu-close"
                  aria-label="진행 단계 접기"
                >
                  <ChevronDown className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <nav className="mt-3 grid gap-2" aria-labelledby="workspace-mobile-steps-title">
                {workspaceSteps.map((step, index) => (
                  <StepButton
                    key={step.id}
                    currentStep={currentStep}
                    enabled={isStepEnabled(step.id, availability)}
                    onClick={(selectedStep) => {
                      onStepClick(selectedStep);
                      onToggle();
                    }}
                    position={index + 1}
                    step={step}
                  />
                ))}
              </nav>
            </div>
          ) : null}

          <button
            type="button"
            onClick={onToggle}
            className="c-workspace-step-navigation__mobile-toggle"
            aria-expanded={isOpen}
            aria-controls="workspace-mobile-steps"
            aria-label={isOpen ? "생성 단계 메뉴 접기" : `생성 단계 메뉴 펼치기, 현재 ${activeIndex + 1}단계 ${activeStep.label}`}
          >
            <span className="c-workspace-step-navigation__mobile-icon">
              <ActiveIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-black text-[var(--app-text)]">
                  {activeIndex + 1}단계 · {activeStep.label}
                </span>
                <span className="shrink-0 text-xs font-black text-[var(--app-muted)]">
                  {activeIndex + 1}/{workspaceSteps.length}
                </span>
              </span>
              <span className="c-workspace-step-navigation__progress">
                <span
                  className="c-workspace-step-navigation__progress-value"
                  style={{ width: `${activeProgress}%` }}
                />
              </span>
            </span>
            {isOpen ? (
              <ChevronDown className="h-5 w-5 shrink-0 text-[var(--app-muted)]" aria-hidden="true" />
            ) : (
              <ChevronUp className="h-5 w-5 shrink-0 text-[var(--app-muted)]" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function WorkspaceStepNavigation({
  canOpenGenerate,
  canOpenProgress,
  canOpenSelect,
  currentStep,
  mobileOpen,
  onStepClick,
  onToggleMobile,
}: WorkspaceStepNavigationProps) {
  const availability = { canOpenGenerate, canOpenProgress, canOpenSelect };

  return (
    <>
      <nav
        className="c-workspace-step-navigation"
        data-layout="desktop"
        aria-label="헤어스타일 생성 단계"
      >
        {workspaceSteps.map((step, index) => (
          <StepButton
            key={step.id}
            currentStep={currentStep}
            enabled={isStepEnabled(step.id, availability)}
            onClick={onStepClick}
            position={index + 1}
            step={step}
          />
        ))}
      </nav>

      <MobileStepOverlay
        canOpenGenerate={canOpenGenerate}
        canOpenProgress={canOpenProgress}
        canOpenSelect={canOpenSelect}
        currentStep={currentStep}
        isOpen={mobileOpen}
        onStepClick={onStepClick}
        onToggle={onToggleMobile}
      />
    </>
  );
}
