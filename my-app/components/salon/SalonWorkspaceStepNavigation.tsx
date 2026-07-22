import {
  ClipboardCheck,
  ImagePlus,
  RefreshCw,
  Wand2,
} from "lucide-react";
import { cn } from "../../lib/utils";

export type SalonWorkspaceWizardStep =
  | "upload"
  | "generate"
  | "progress"
  | "select";

const steps: Array<{
  id: SalonWorkspaceWizardStep;
  label: string;
  description: string;
  icon: typeof ImagePlus;
}> = [
  {
    id: "upload",
    label: "고객 사진",
    description: "동의와 타깃을 확인합니다",
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
    label: "생성 진행",
    description: "서버 작업과 완료 알림을 확인합니다",
    icon: RefreshCw,
  },
  {
    id: "select",
    label: "CRM 저장",
    description: "완료된 결과를 상담 기록으로 남깁니다",
    icon: ClipboardCheck,
  },
];

interface SalonWorkspaceStepNavigationProps {
  canOpenGenerate: boolean;
  canOpenProgress: boolean;
  canOpenSelect: boolean;
  currentStep: SalonWorkspaceWizardStep;
  onStepChange: (step: SalonWorkspaceWizardStep) => void;
}

export function SalonWorkspaceStepNavigation({
  canOpenGenerate,
  canOpenProgress,
  canOpenSelect,
  currentStep,
  onStepChange,
}: SalonWorkspaceStepNavigationProps) {
  return (
    <section className="grid gap-2 md:grid-cols-4" aria-label="살롱 헤어 상담 단계">
      {steps.map((step) => {
        const active = currentStep === step.id;
        const enabled =
          step.id === "upload" ||
          (step.id === "generate" && canOpenGenerate) ||
          (step.id === "progress" && canOpenProgress) ||
          (step.id === "select" && canOpenSelect);
        const Icon = step.icon;

        return (
          <button
            key={step.id}
            type="button"
            onClick={() => onStepChange(step.id)}
            disabled={!enabled}
            aria-current={active ? "step" : undefined}
            className={cn(
              "flex min-h-[82px] items-center gap-3 border px-4 py-3 text-left transition",
              active
                ? "border-[var(--app-border-strong)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)]"
                : "border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] hover:border-[var(--app-border-strong)]",
              !enabled && "cursor-not-allowed opacity-45",
            )}
          >
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] border",
                active
                  ? "border-white/20 bg-white/10 text-[var(--app-inverse-text)]"
                  : "border-[var(--app-border)] bg-[var(--app-surface-muted)] text-[var(--app-text)]",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black">{step.label}</span>
              <span
                className={cn(
                  "mt-1 block text-xs leading-5",
                  active ? "text-white/70" : "text-[var(--app-muted)]",
                )}
              >
                {step.description}
              </span>
            </span>
          </button>
        );
      })}
    </section>
  );
}
