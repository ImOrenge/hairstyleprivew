"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ClipboardCheck,
  ImagePlus,
  RefreshCw,
  Scissors,
  Shirt,
  Sparkles,
  Wand2,
} from "lucide-react";
import { PipelineStatusIndicator } from "../generate/PipelineStatusIndicator";
import { UploadArea } from "../upload/UploadArea";
import { Button } from "../ui/Button";
import { Panel, SurfaceCard } from "../ui/Surface";
import { useAdminReadOnly } from "../../hooks/useAdminReadOnly";
import { useGenerate } from "../../hooks/useGenerate";
import { useUpload } from "../../hooks/useUpload";
import type { PersonalColorResult } from "../../lib/fashion-types";
import type { GeneratedVariant } from "../../lib/recommendation-types";
import { cn } from "../../lib/utils";
import { convertImageFileToWebp } from "../../lib/webp-client";
import { useGenerationStore } from "../../store/useGenerationStore";

type WizardStep = "upload" | "generate" | "select";
type ServiceOptionValue = "cut" | "perm" | "color" | "bleach" | "treatment" | "other";

const steps: Array<{
  id: WizardStep;
  label: string;
  description: string;
  icon: typeof ImagePlus;
}> = [
  {
    id: "upload",
    label: "사진 업로드",
    description: "정면 사진을 검증합니다",
    icon: ImagePlus,
  },
  {
    id: "generate",
    label: "3x3 헤어 생성",
    description: "9가지 후보 보드를 만듭니다",
    icon: Wand2,
  },
  {
    id: "select",
    label: "헤어 선택",
    description: "결과를 저장하고 이어갑니다",
    icon: ClipboardCheck,
  },
];

const serviceOptions: Array<{ value: ServiceOptionValue; label: string }> = [
  { value: "cut", label: "커트" },
  { value: "perm", label: "펌" },
  { value: "color", label: "염색" },
  { value: "bleach", label: "탈색" },
  { value: "treatment", label: "트리트먼트" },
  { value: "other", label: "기타" },
];

function getTodayValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function isRenderableVariant(variant: GeneratedVariant) {
  return Boolean(variant.outputUrl || variant.generatedImagePath || variant.status === "completed");
}

function formatStatus(status: GeneratedVariant["status"]) {
  if (status === "completed") return "완료";
  if (status === "generating") return "생성 중";
  if (status === "failed") return "실패";
  return "대기";
}

function formatLength(value: GeneratedVariant["lengthBucket"]) {
  if (value === "short") return "단발";
  if (value === "medium") return "중단발";
  return "긴머리";
}

function statusTone(status: GeneratedVariant["status"]) {
  if (status === "completed") return "bg-emerald-100 text-emerald-700";
  if (status === "failed") return "bg-rose-100 text-rose-700";
  if (status === "generating") return "bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)]";
  return "bg-[var(--app-surface-muted)] text-[var(--app-muted)]";
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

function formatTone(value?: string | null) {
  if (value === "warm") return "웜톤";
  if (value === "cool") return "쿨톤";
  if (value === "neutral") return "뉴트럴";
  return "-";
}

function formatContrast(value?: string | null) {
  if (value === "low") return "낮은 대비";
  if (value === "high") return "높은 대비";
  if (value === "medium") return "중간 대비";
  return "-";
}

function PersonalColorSwatches({ colors }: { colors: PersonalColorResult["bestColors"] }) {
  if (!colors.length) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {colors.slice(0, 5).map((color) => (
        <span
          key={`${color.nameEn}-${color.hex}`}
          className="inline-flex items-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 py-1 text-xs font-bold text-[var(--app-text)]"
        >
          <span
            aria-hidden="true"
            className="h-4 w-4 rounded-full border border-black/10"
            style={{ backgroundColor: color.hex }}
          />
          {color.nameKo}
        </span>
      ))}
    </div>
  );
}

interface PersonalColorAnalyzeResponse {
  personalColor?: PersonalColorResult;
  error?: string;
}

interface StyleProfileResponse {
  profile?: {
    personalColor?: PersonalColorResult | null;
  };
  error?: string;
}

function StepButton({
  currentStep,
  enabled,
  onClick,
  step,
}: {
  currentStep: WizardStep;
  enabled: boolean;
  onClick: (step: WizardStep) => void;
  step: (typeof steps)[number];
}) {
  const active = currentStep === step.id;
  const Icon = step.icon;

  return (
    <button
      type="button"
      onClick={() => onClick(step.id)}
      disabled={!enabled}
      className={cn(
        "flex min-h-[84px] items-center gap-3 border px-4 py-3 text-left transition",
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
        <span className={cn("mt-1 block text-xs leading-5", active ? "text-white/70" : "text-[var(--app-muted)]")}>
          {step.description}
        </span>
      </span>
    </button>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <SurfaceCard className="px-4 py-3">
      <p className="text-[11px] font-bold uppercase text-[var(--app-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-black text-[var(--app-text)]">{value}</p>
    </SurfaceCard>
  );
}

function MobileStepOverlay({
  canOpenGenerate,
  canOpenSelect,
  currentStep,
  isOpen,
  onStepClick,
  onToggle,
}: {
  canOpenGenerate: boolean;
  canOpenSelect: boolean;
  currentStep: WizardStep;
  isOpen: boolean;
  onStepClick: (step: WizardStep) => void;
  onToggle: () => void;
}) {
  const activeIndex = Math.max(
    steps.findIndex((step) => step.id === currentStep),
    0,
  );
  const activeStep = steps[activeIndex] || steps[0];
  const ActiveIcon = activeStep.icon;
  const activeProgress = Math.round(((activeIndex + 1) / steps.length) * 100);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 md:hidden">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/55 to-transparent" />
      <div className="relative mx-auto max-w-xl px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <div className="overflow-hidden rounded-t-[var(--app-radius-panel)] border border-[var(--app-border-strong)] bg-[var(--app-surface)] shadow-2xl">
          {isOpen ? (
            <div className="border-b border-[var(--app-border)] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="app-kicker">Wizard</p>
                  <p className="mt-1 text-sm font-black text-[var(--app-text)]">진행 단계</p>
                </div>
                <button
                  type="button"
                  onClick={onToggle}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border)] text-[var(--app-text)] transition hover:bg-[var(--app-surface-muted)]"
                  aria-label="진행 단계 접기"
                >
                  <ChevronDown className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-3 grid gap-2">
                {steps.map((step) => (
                  <StepButton
                    key={step.id}
                    currentStep={currentStep}
                    enabled={step.id === "upload" || (step.id === "generate" && canOpenGenerate) || (step.id === "select" && canOpenSelect)}
                    onClick={onStepClick}
                    step={step}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={onToggle}
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
            aria-expanded={isOpen}
            aria-label={isOpen ? "진행 단계 접기" : "진행 단계 펼치기"}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] text-[var(--app-text)]">
              <ActiveIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-black text-[var(--app-text)]">{activeStep.label}</span>
                <span className="shrink-0 text-xs font-black text-[var(--app-muted)]">
                  {activeIndex + 1}/{steps.length}
                </span>
              </span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--app-surface-muted)]">
                <span
                  className="block h-full rounded-full bg-[var(--app-accent-strong)] transition-all"
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

function VariantCard({
  disabled,
  isSelected,
  onSelect,
  variant,
}: {
  disabled: boolean;
  isSelected: boolean;
  onSelect: (variant: GeneratedVariant) => void;
  variant: GeneratedVariant;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(variant)}
      disabled={disabled}
      className={cn(
        "app-card overflow-hidden text-left transition",
        isSelected && "border-[var(--app-border-strong)] ring-2 ring-[var(--app-ring)]",
        disabled ? "cursor-not-allowed opacity-60" : "hover:-translate-y-0.5 hover:border-[var(--app-border-strong)]",
      )}
    >
      <div className="relative aspect-[4/5] bg-[var(--app-surface-muted)]">
        {variant.outputUrl ? (
          <img src={variant.outputUrl} alt={variant.label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-[var(--app-muted)]">
            {variant.status === "failed" ? variant.error || "생성에 실패했습니다" : "미리보기 준비 중"}
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <span className={cn("rounded-[var(--app-radius-control)] px-2.5 py-1 text-[11px] font-bold", statusTone(variant.status))}>
            {formatStatus(variant.status)}
          </span>
          {isSelected ? (
            <span className="rounded-[var(--app-radius-control)] bg-[var(--app-inverse)] px-2.5 py-1 text-[11px] font-bold text-[var(--app-inverse-text)]">
              선택됨
            </span>
          ) : null}
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-black text-[var(--app-text)]">{variant.label}</h3>
          <span className="shrink-0 rounded-[var(--app-radius-control)] bg-[var(--app-surface)] px-2 py-1 text-[11px] font-bold text-[var(--app-muted)]">
            {formatLength(variant.lengthBucket)}
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-5 text-[var(--app-muted)]">{variant.reason}</p>
        {variant.evaluation ? (
          <p className="mt-3 text-xs font-bold text-[var(--app-accent-strong)]">AI 점수 {variant.evaluation.score}</p>
        ) : null}
      </div>
    </button>
  );
}

function ServiceConfirmDialog({
  error,
  isOpen,
  isSubmitting,
  onClose,
  onConfirm,
  serviceDate,
  serviceType,
  setServiceDate,
  setServiceType,
}: {
  error: string | null;
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
  serviceDate: string;
  serviceType: ServiceOptionValue;
  setServiceDate: (value: string) => void;
  setServiceType: (value: ServiceOptionValue) => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 px-3 pb-3 pt-16 sm:items-center sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="에프터케어 시술 확정"
        className="app-panel w-full max-w-md p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="app-kicker">Aftercare</p>
            <h2 className="mt-2 text-xl font-black text-[var(--app-text)]">에프터케어 시술 확정</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
              선택한 헤어를 에프터케어 기록으로 저장합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--app-radius-control)] border border-[var(--app-border)] px-3 py-1.5 text-sm font-bold text-[var(--app-muted)] transition hover:bg-[var(--app-surface-muted)]"
          >
            닫기
          </button>
        </div>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm font-bold text-[var(--app-text)]">
            시술 종류
            <select
              value={serviceType}
              onChange={(event) => setServiceType(event.target.value as ServiceOptionValue)}
              className="app-input h-11 px-3"
            >
              {serviceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-bold text-[var(--app-text)]">
            시술 날짜
            <span className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-subtle)]" />
              <input
                type="date"
                value={serviceDate}
                onChange={(event) => setServiceDate(event.target.value)}
                className="app-input h-11 w-full pl-10 pr-3"
              />
            </span>
          </label>
        </div>

        {error ? (
          <p className="mt-4 border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isSubmitting || !serviceDate}>
            {isSubmitting ? "저장 중" : "확정"}
          </Button>
        </div>
      </section>
    </div>
  );
}

export function WorkspaceWizard() {
  const router = useRouter();
  const { isAdminReadOnly } = useAdminReadOnly();
  const { runGridPipeline, resetPipeline } = useGenerate();
  const { validateImage, resetValidation } = useUpload();

  const previewUrl = useGenerationStore((state) => state.previewUrl);
  const originalImage = useGenerationStore((state) => state.originalImage);
  const isGenerating = useGenerationStore((state) => state.isGenerating);
  const progress = useGenerationStore((state) => state.progress);
  const pipelineStage = useGenerationStore((state) => state.pipelineStage);
  const pipelineMessage = useGenerationStore((state) => state.pipelineMessage);
  const pipelineError = useGenerationStore((state) => state.pipelineError);
  const generationId = useGenerationStore((state) => state.generationId);
  const analysisSummary = useGenerationStore((state) => state.analysisSummary);
  const recommendationGrid = useGenerationStore((state) => state.recommendationGrid);
  const selectedVariantId = useGenerationStore((state) => state.selectedVariantId);
  const gridGenerationProgress = useGenerationStore((state) => state.gridGenerationProgress);
  const setOriginalImage = useGenerationStore((state) => state.setOriginalImage);
  const clearOriginalImage = useGenerationStore((state) => state.clearOriginalImage);
  const hydrateOriginalImage = useGenerationStore((state) => state.hydrateOriginalImage);
  const clearRecommendationSession = useGenerationStore((state) => state.clearRecommendationSession);
  const setSelectedVariantId = useGenerationStore((state) => state.setSelectedVariantId);
  const clearLatestResult = useGenerationStore((state) => state.clearLatestResult);

  const [currentStep, setCurrentStep] = useState<WizardStep>("upload");
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingSelection, setIsSavingSelection] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [serviceType, setServiceType] = useState<ServiceOptionValue>("cut");
  const [serviceDate, setServiceDate] = useState(getTodayValue);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [mobileStepsOpen, setMobileStepsOpen] = useState(false);
  const [personalColor, setPersonalColor] = useState<PersonalColorResult | null>(null);
  const [isLoadingPersonalColor, setIsLoadingPersonalColor] = useState(true);
  const [isAnalyzingPersonalColor, setIsAnalyzingPersonalColor] = useState(false);
  const [personalColorError, setPersonalColorError] = useState<string | null>(null);

  useEffect(() => {
    void hydrateOriginalImage();
  }, [hydrateOriginalImage]);

  useEffect(() => {
    let active = true;

    async function loadPersonalColor() {
      setIsLoadingPersonalColor(true);
      try {
        const response = await fetch("/api/style-profile", { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as StyleProfileResponse;
        if (!active) return;

        if (response.ok) {
          setPersonalColor(data.profile?.personalColor || null);
          setPersonalColorError(null);
        }
      } finally {
        if (active) {
          setIsLoadingPersonalColor(false);
        }
      }
    }

    void loadPersonalColor();
    return () => {
      active = false;
    };
  }, []);

  const completedCount = recommendationGrid.filter((variant) => variant.status === "completed").length;
  const failedCount = recommendationGrid.filter((variant) => variant.status === "failed").length;
  const readyCount = recommendationGrid.filter(isRenderableVariant).length;
  const selectedVariant = useMemo(
    () => recommendationGrid.find((variant) => variant.id === selectedVariantId) || null,
    [recommendationGrid, selectedVariantId],
  );
  const canOpenGenerate = Boolean(previewUrl);
  const canOpenSelect = Boolean(generationId && recommendationGrid.length > 0);

  const handleStepClick = (step: WizardStep) => {
    if (step === "upload") {
      setMobileStepsOpen(false);
      setCurrentStep(step);
      return;
    }
    if (step === "generate" && canOpenGenerate) {
      setMobileStepsOpen(false);
      setCurrentStep(step);
      return;
    }
    if (step === "select" && canOpenSelect) {
      setMobileStepsOpen(false);
      setCurrentStep(step);
    }
  };

  const handleSelectFile = async (file: File) => {
    if (isAdminReadOnly) return;

    setIsUploading(true);
    setActionError(null);
    try {
      const result = await validateImage(file);
      if (result.ok) {
        const webpFile = await convertImageFileToWebp(file);
        setOriginalImage(webpFile);
        clearRecommendationSession();
        resetPipeline();
        setCurrentStep(personalColor ? "generate" : "upload");
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleResetPhoto = () => {
    clearOriginalImage();
    clearRecommendationSession();
    resetPipeline();
    resetValidation();
    setActionError(null);
    setPersonalColorError(null);
    setCurrentStep("upload");
  };

  const handleAnalyzePersonalColor = async () => {
    if (!originalImage || isAnalyzingPersonalColor || isAdminReadOnly) return;

    setIsAnalyzingPersonalColor(true);
    setPersonalColorError(null);
    setActionError(null);

    try {
      const referenceImageDataUrl = await fileToDataUrl(originalImage);
      const response = await fetch("/api/personal-color/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceImageDataUrl }),
      });
      const data = (await response.json().catch(() => ({}))) as PersonalColorAnalyzeResponse;

      if (!response.ok || !data.personalColor) {
        throw new Error(data.error || "퍼스널컬러 진단에 실패했습니다.");
      }

      setPersonalColor(data.personalColor);
      setCurrentStep("generate");
    } catch (error) {
      setPersonalColorError(error instanceof Error ? error.message : "퍼스널컬러 진단에 실패했습니다.");
    } finally {
      setIsAnalyzingPersonalColor(false);
    }
  };

  const handleGenerate = async () => {
    if (!previewUrl || isGenerating || isAdminReadOnly) return;

    setActionError(null);
    clearLatestResult();
    clearRecommendationSession();
    resetPipeline();
    setSelectedVariantId(null);

    try {
      await runGridPipeline();
      setCurrentStep("select");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "헤어 생성 보드를 만들지 못했습니다.");
    }
  };

  const handleSelectVariant = async (variant: GeneratedVariant) => {
    if (!generationId || !variant.outputUrl || isSavingSelection) return;

    setIsSavingSelection(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/generations/${encodeURIComponent(generationId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedVariantId: variant.id }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "선택한 헤어를 저장하지 못했습니다.");
      }

      setSelectedVariantId(variant.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "선택한 헤어를 저장하지 못했습니다.");
    } finally {
      setIsSavingSelection(false);
    }
  };

  const handleRegenerate = () => {
    clearLatestResult();
    clearRecommendationSession();
    resetPipeline();
    setSelectedVariantId(null);
    setActionError(null);
    setCurrentStep(previewUrl ? "generate" : "upload");
  };

  const handleOpenAftercareConfirm = () => {
    if (!selectedVariantId) {
      setActionError("에프터케어를 만들기 전에 헤어를 선택하세요.");
      return;
    }
    setConfirmError(null);
    setIsConfirmOpen(true);
  };

  const handleConfirmService = async () => {
    if (!generationId || !selectedVariantId || isConfirming) return;

    setIsConfirming(true);
    setConfirmError(null);

    try {
      const response = await fetch("/api/hair-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationId,
          selectedVariantId,
          serviceType,
          serviceDate,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { redirectTo?: string; error?: string };

      if (!response.ok) {
        throw new Error(data.error || "에프터케어 기록을 만들지 못했습니다.");
      }

      router.push(data.redirectTo || "/aftercare");
    } catch (error) {
      setConfirmError(error instanceof Error ? error.message : "에프터케어 기록을 만들지 못했습니다.");
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <>
      <Panel as="section" className="overflow-hidden p-4 sm:p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="app-kicker">Workspace</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--app-text)] sm:text-4xl">
              헤어 생성 워크스페이스
            </h1>
            <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
              사진 업로드부터 3x3 헤어 후보 생성, 선택 저장까지 한 흐름에서 진행합니다.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
            <StatTile label="준비" value={readyCount.toLocaleString("ko-KR")} />
            <StatTile label="완료" value={completedCount.toLocaleString("ko-KR")} />
            <StatTile label="실패" value={failedCount.toLocaleString("ko-KR")} />
          </div>
        </div>
      </Panel>

      <section className="hidden gap-2 md:grid md:grid-cols-3">
        {steps.map((step) => (
          <StepButton
            key={step.id}
            currentStep={currentStep}
            enabled={step.id === "upload" || (step.id === "generate" && canOpenGenerate) || (step.id === "select" && canOpenSelect)}
            onClick={handleStepClick}
            step={step}
          />
        ))}
      </section>

      <MobileStepOverlay
        canOpenGenerate={canOpenGenerate}
        canOpenSelect={canOpenSelect}
        currentStep={currentStep}
        isOpen={mobileStepsOpen}
        onStepClick={handleStepClick}
        onToggle={() => setMobileStepsOpen((open) => !open)}
      />

      {currentStep === "upload" ? (
        <Panel as="section" className="grid gap-5 p-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:p-5">
          <div className="space-y-4">
            <div>
              <p className="app-kicker">1단계</p>
              <h2 className="mt-2 text-2xl font-black text-[var(--app-text)]">사진 업로드/검증</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
                안정적인 추천 보드를 위해 얼굴이 잘 보이는 정면 사진을 사용하세요.
              </p>
            </div>
            {isAdminReadOnly ? (
              <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                관리자 읽기 전용 모드입니다. 생성은 고객 계정에서 진행하세요.
              </div>
            ) : null}
            {previewUrl ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="ghost" onClick={handleResetPhoto}>
                  사진 다시 선택
                </Button>
              </div>
            ) : null}
          </div>

          <div className="mx-auto w-full max-w-xl">
            <UploadArea
              onSelectFile={handleSelectFile}
              disabled={isUploading || isAdminReadOnly}
              previewUrl={previewUrl}
            />
            {previewUrl && !isLoadingPersonalColor && !personalColor ? (
              <SurfaceCard className="mt-4 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)]">
                    <Sparkles className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-[var(--app-text)]">첫 퍼스널컬러 진단</p>
                    <p className="mt-1 text-sm leading-5 text-[var(--app-muted)]">
                      업로드한 얼굴 사진으로 웜/쿨톤과 대비감을 분석해 이후 패션 추천 팔레트에 반영합니다.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={handleAnalyzePersonalColor}
                        disabled={isAnalyzingPersonalColor || isAdminReadOnly}
                      >
                        {isAnalyzingPersonalColor ? "진단 중..." : "첫 퍼스널컬러 진단"}
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => setCurrentStep("generate")}>
                        헤어 생성으로 계속
                      </Button>
                    </div>
                    {personalColorError ? (
                      <p className="mt-3 text-sm font-semibold text-rose-600">{personalColorError}</p>
                    ) : null}
                  </div>
                </div>
              </SurfaceCard>
            ) : null}
            {previewUrl && personalColor ? (
              <SurfaceCard className="mt-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="app-kicker">Personal Color</p>
                    <p className="mt-1 text-sm font-black text-[var(--app-text)]">
                      {formatTone(personalColor.tone)} · {formatContrast(personalColor.contrast)}
                    </p>
                    <p className="mt-1 text-sm leading-5 text-[var(--app-muted)]">
                      저장된 진단 결과를 스타일 추천에 사용합니다.
                    </p>
                  </div>
                  <span className="rounded-[var(--app-radius-control)] bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                    저장됨
                  </span>
                </div>
                <PersonalColorSwatches colors={personalColor.bestColors} />
                <Button type="button" className="mt-4" onClick={() => setCurrentStep("generate")}>
                  헤어 생성으로 계속
                </Button>
              </SurfaceCard>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {currentStep === "generate" ? (
        <Panel as="section" className="overflow-hidden">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <div className="relative min-h-[420px] bg-[var(--app-surface-muted)]">
              {previewUrl ? (
                <img src={previewUrl} alt="업로드한 정면 사진" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="flex min-h-[420px] items-center justify-center px-6 text-center text-sm text-[var(--app-muted)]">
                  먼저 사진을 업로드하세요.
                </div>
              )}
              <div className="absolute inset-x-3 top-3 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-[360px]">
                <PipelineStatusIndicator
                  stage={pipelineStage}
                  message={pipelineMessage}
                  error={pipelineError}
                  progress={progress}
                  mode="overlay"
                />
              </div>
            </div>

            <div className="flex flex-col justify-between gap-6 border-t border-[var(--app-border)] p-4 lg:border-l lg:border-t-0 lg:p-6">
              <div>
                <p className="app-kicker">2단계</p>
                <h2 className="mt-2 text-2xl font-black text-[var(--app-text)]">3x3 헤어 생성</h2>
                <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
                  얼굴형, 밸런스, 볼륨 전략을 분석한 뒤 9가지 헤어 후보를 생성합니다.
                </p>
                {analysisSummary ? (
                  <SurfaceCard className="mt-5 p-4">
                    <p className="app-kicker">분석 요약</p>
                    <h3 className="mt-2 text-xl font-black text-[var(--app-text)]">{analysisSummary.faceShape}</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">{analysisSummary.summary}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {analysisSummary.volumeFocus.map((item) => (
                        <span key={item} className="app-chip px-3 py-1 text-xs font-bold">
                          {item}
                        </span>
                      ))}
                    </div>
                  </SurfaceCard>
                ) : null}
              </div>

              <div className="grid gap-3">
                <SurfaceCard className="px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase text-[var(--app-muted)]">보드 진행률</p>
                      <p className="mt-1 text-2xl font-black text-[var(--app-text)]">{gridGenerationProgress}%</p>
                    </div>
                    <Sparkles className="h-7 w-7 text-[var(--app-accent-strong)]" aria-hidden="true" />
                  </div>
                </SurfaceCard>
                {actionError ? (
                  <div className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                    {actionError}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={handleGenerate} disabled={!previewUrl || isGenerating || isAdminReadOnly}>
                    {isGenerating ? "생성 중" : generationId ? "다시 생성" : "생성 시작"}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setCurrentStep("upload")}>
                    사진 변경
                  </Button>
                  {canOpenSelect ? (
                    <Button type="button" variant="ghost" onClick={() => setCurrentStep("select")}>
                      후보 보기
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </Panel>
      ) : null}

      {currentStep === "select" ? (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Panel as="section" className="p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="app-kicker">3단계</p>
                <h2 className="mt-2 text-2xl font-black text-[var(--app-text)]">헤어 선택 및 다음 작업</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
                  완료된 후보를 선택한 뒤 결과 보기, 패션 추천, 에프터케어로 이어가세요.
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={handleRegenerate}>
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                다시 생성
              </Button>
            </div>

            {actionError ? (
              <div className="mt-4 border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                {actionError}
              </div>
            ) : null}

            {recommendationGrid.length === 0 ? (
              <SurfaceCard className="mt-5 border-dashed px-5 py-10 text-center">
                <Wand2 className="mx-auto h-9 w-9 text-[var(--app-subtle)]" aria-hidden="true" />
                <p className="mt-3 text-sm font-bold text-[var(--app-text)]">아직 후보가 없습니다.</p>
                <Button type="button" className="mt-4" onClick={() => setCurrentStep(previewUrl ? "generate" : "upload")}>
                  생성 단계로 이동
                </Button>
              </SurfaceCard>
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {recommendationGrid.map((variant) => (
                  <VariantCard
                    key={variant.id}
                    disabled={!variant.outputUrl || isSavingSelection}
                    isSelected={selectedVariantId === variant.id}
                    onSelect={handleSelectVariant}
                    variant={variant}
                  />
                ))}
              </div>
            )}
          </Panel>

          <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
            <Panel as="section" className="p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] bg-[var(--app-surface-muted)] text-[var(--app-text)]">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-black text-[var(--app-text)]">
                    {selectedVariant ? selectedVariant.label : "선택된 헤어가 없습니다"}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-[var(--app-muted)]">
                    {selectedVariant ? selectedVariant.reason : "완료된 후보를 선택하면 다음 작업이 열립니다."}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-2">
                {generationId && selectedVariantId ? (
                  <>
                    <Link
                      href={`/result/${generationId}?variant=${encodeURIComponent(selectedVariantId)}`}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-4 py-2 text-sm font-bold uppercase tracking-[0.04em] text-[var(--app-inverse-text)] transition hover:bg-[var(--app-inverse-muted)]"
                    >
                      결과 보기
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                    <Link
                      href={`/styler/new?generationId=${encodeURIComponent(generationId)}&variant=${encodeURIComponent(selectedVariantId)}`}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-2 text-sm font-bold uppercase tracking-[0.04em] text-[var(--app-text)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-muted)]"
                    >
                      <Shirt className="h-4 w-4" aria-hidden="true" />
                      패션 추천
                    </Link>
                  </>
                ) : (
                  <Button type="button" disabled>
                    헤어를 먼저 선택
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleOpenAftercareConfirm}
                  disabled={!generationId || !selectedVariantId}
                >
                  <Scissors className="mr-2 h-4 w-4" aria-hidden="true" />
                  에프터케어 시술 확정
                </Button>
              </div>
            </Panel>
          </aside>
        </section>
      ) : null}

      <ServiceConfirmDialog
        error={confirmError}
        isOpen={isConfirmOpen}
        isSubmitting={isConfirming}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirmService}
        serviceDate={serviceDate}
        serviceType={serviceType}
        setServiceDate={setServiceDate}
        setServiceType={setServiceType}
      />
    </>
  );
}
