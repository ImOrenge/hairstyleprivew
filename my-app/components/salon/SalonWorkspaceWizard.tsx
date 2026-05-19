"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  ImagePlus,
  RefreshCw,
  Scissors,
  UserRound,
  Wand2,
} from "lucide-react";
import { PipelineStatusIndicator } from "../generate/PipelineStatusIndicator";
import { Button } from "../ui/Button";
import { Panel, SurfaceCard } from "../ui/Surface";
import { UploadArea } from "../upload/UploadArea";
import { useAdminReadOnly } from "../../hooks/useAdminReadOnly";
import { useUpload } from "../../hooks/useUpload";
import type { GeneratedVariant, MemberStyleTarget } from "../../lib/recommendation-types";
import type { SalonCustomer, SalonCustomerStyleTarget, SalonServiceType } from "../../lib/salon-crm-types";
import { cn } from "../../lib/utils";
import { convertImageFileToWebp, convertImageSrcToWebpDataUrl } from "../../lib/webp-client";
import type { PipelineStage } from "../../store/useGenerationStore";

type WizardStep = "upload" | "generate" | "select";

interface DetailResponse {
  customer?: SalonCustomer;
  error?: string;
}

interface RecommendationApiResponse {
  generationId?: string;
  analysis?: unknown;
  recommendations?: Array<GeneratedVariant & { promptArtifactToken?: string }>;
  creditsRequired?: number;
  error?: string;
}

interface GenerationApiResponse {
  id?: string;
  variantId?: string;
  variantIndex?: number;
  outputUrl?: string;
  generatedImagePath?: string;
  evaluation?: GeneratedVariant["evaluation"];
  chargedCredits?: number;
  error?: string;
  code?: string;
  status?: number;
}

interface ConfirmResponse {
  redirectTo?: string;
  error?: string;
}

const GENERATION_MAX_CONCURRENCY = 1;
const GENERATION_LAUNCH_GAP_MS = 1500;
const VARIANT_MAX_ATTEMPTS = 2;
const VARIANT_RETRY_DELAY_MS = 3000;
const INSUFFICIENT_CREDITS_CODE = "INSUFFICIENT_CREDITS";
const INSUFFICIENT_CREDITS_MESSAGE = "크레딧이 부족합니다. 크레딧을 충전한 뒤 다시 시도해 주세요.";

const steps: Array<{
  id: WizardStep;
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
    label: "헤어 보드",
    description: "3x3 후보를 생성합니다",
    icon: Wand2,
  },
  {
    id: "select",
    label: "CRM 저장",
    description: "상담/시술 기록으로 남깁니다",
    icon: ClipboardCheck,
  },
];

const serviceOptions: Array<{ value: SalonServiceType; label: string }> = [
  { value: "cut", label: "커트" },
  { value: "perm", label: "펌" },
  { value: "color", label: "염색" },
  { value: "bleach", label: "탈색" },
  { value: "treatment", label: "클리닉/트리트먼트" },
  { value: "other", label: "기타" },
];

class GenerationApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(input: { message: string; status: number; code?: string }) {
    super(input.message);
    this.name = "GenerationApiError";
    this.status = input.status;
    this.code = input.code;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getTodayValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function toLocalInputValue(value: Date) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function defaultFollowUpValue() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  date.setHours(10, 0, 0, 0);
  return toLocalInputValue(date);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function runStaggeredPool<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
) {
  const activeTasks = new Set<Promise<void>>();

  for (const [index, item] of items.entries()) {
    while (activeTasks.size >= GENERATION_MAX_CONCURRENCY) {
      await Promise.race(activeTasks);
    }

    const task = worker(item, index)
      .catch(() => undefined)
      .finally(() => {
        activeTasks.delete(task);
      });
    activeTasks.add(task);

    if (index < items.length - 1) {
      await sleep(GENERATION_LAUNCH_GAP_MS);
    }
  }

  await Promise.allSettled(activeTasks);
}

function isInsufficientCreditsError(error: unknown) {
  if (!(error instanceof GenerationApiError)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    error.code === INSUFFICIENT_CREDITS_CODE ||
    (error.status === 409 && (message.includes("credit") || message.includes("크레딧")))
  );
}

function toErrorMessage(error: unknown, fallback: string) {
  if (isInsufficientCreditsError(error)) {
    return INSUFFICIENT_CREDITS_MESSAGE;
  }

  return error instanceof Error && error.message ? error.message : fallback;
}

function summarizeVariantFailures(errors: string[]) {
  const uniqueErrors = Array.from(new Set(errors.map((item) => item.trim()).filter(Boolean)));
  if (uniqueErrors.includes(INSUFFICIENT_CREDITS_MESSAGE)) {
    return INSUFFICIENT_CREDITS_MESSAGE;
  }

  return uniqueErrors[0] ? `모든 후보 생성이 실패했습니다. 첫 오류: ${uniqueErrors[0]}` : "모든 후보 생성이 실패했습니다.";
}

function toGeneratedVariant(candidate: GeneratedVariant & { promptArtifactToken?: string }): GeneratedVariant {
  return {
    ...candidate,
    status: "queued",
    outputUrl: null,
    generatedImagePath: null,
    evaluation: null,
    error: null,
    generatedAt: null,
  };
}

function statusTone(status: GeneratedVariant["status"]) {
  if (status === "completed") return "bg-emerald-100 text-emerald-700";
  if (status === "failed") return "bg-rose-100 text-rose-700";
  if (status === "generating") return "bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)]";
  return "bg-[var(--app-surface-muted)] text-[var(--app-muted)]";
}

function formatStatus(status: GeneratedVariant["status"]) {
  if (status === "completed") return "완료";
  if (status === "generating") return "생성 중";
  if (status === "failed") return "실패";
  return "대기";
}

function formatLength(value: GeneratedVariant["lengthBucket"]) {
  if (value === "short") return "숏";
  if (value === "medium") return "미디엄";
  return "롱";
}

function styleTargetLabel(value: SalonCustomerStyleTarget | null) {
  if (value === "male") return "남성";
  if (value === "female") return "여성";
  return "미선택";
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
        <span className={cn("mt-1 block text-xs leading-5", active ? "text-white/70" : "text-[var(--app-muted)]")}>
          {step.description}
        </span>
      </span>
    </button>
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
      <div className="relative aspect-[3/5] bg-[var(--app-surface-muted)]">
        {variant.outputUrl ? (
          <Image src={variant.outputUrl} alt={variant.label} fill unoptimized className="object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-[var(--app-muted)]">
            {variant.status === "failed" ? variant.error || "생성에 실패했습니다." : "미리보기 준비 중"}
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
      </div>
    </button>
  );
}

export function SalonWorkspaceWizard({ customerId }: { customerId: string }) {
  const router = useRouter();
  const { isAdminReadOnly } = useAdminReadOnly();
  const { validateImage, resetValidation } = useUpload();
  const [customer, setCustomer] = useState<SalonCustomer | null>(null);
  const [currentStep, setCurrentStep] = useState<WizardStep>("upload");
  const [styleTarget, setStyleTarget] = useState<MemberStyleTarget | "">("");
  const [photoConsentConfirmed, setPhotoConsentConfirmed] = useState(false);
  const [originalImage, setOriginalImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>("idle");
  const [pipelineMessage, setPipelineMessage] = useState("고객 사진과 생성 동의를 확인해 주세요.");
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [recommendationGrid, setRecommendationGrid] = useState<GeneratedVariant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [gridGenerationProgress, setGridGenerationProgress] = useState(0);
  const [serviceType, setServiceType] = useState<SalonServiceType>("cut");
  const [serviceDate, setServiceDate] = useState(getTodayValue);
  const [nextRecommendedVisitAt, setNextRecommendedVisitAt] = useState(defaultFollowUpValue);
  const [memo, setMemo] = useState("");
  const [createAftercare, setCreateAftercare] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadCustomer() {
      setError(null);
      const response = await fetch(`/api/salon/customers/${customerId}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as DetailResponse;
      if (!active) return;

      if (response.ok && data.customer) {
        setCustomer(data.customer);
        setStyleTarget(data.customer.styleTarget || "");
        setPhotoConsentConfirmed(Boolean(data.customer.photoGenerationConsentAt));
      } else {
        setError(data.error || "고객 정보를 불러오지 못했습니다.");
      }
    }

    void loadCustomer();
    return () => {
      active = false;
    };
  }, [customerId]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const completedCount = recommendationGrid.filter((variant) => variant.status === "completed").length;
  const failedCount = recommendationGrid.filter((variant) => variant.status === "failed").length;
  const readyCount = recommendationGrid.filter((variant) => variant.status === "queued" || variant.status === "generating").length;
  const selectedVariant = useMemo(
    () => recommendationGrid.find((variant) => variant.id === selectedVariantId) || null,
    [recommendationGrid, selectedVariantId],
  );
  const canOpenGenerate = Boolean(previewUrl && styleTarget && photoConsentConfirmed);
  const canOpenSelect = recommendationGrid.length > 0;

  const setPipelineState = (stage: PipelineStage, nextMessage: string) => {
    setPipelineStage(stage);
    setPipelineMessage(nextMessage);
    if (stage !== "failed") {
      setPipelineError(null);
    }
  };

  const updateVariant = (variantId: string, patch: Partial<GeneratedVariant>) => {
    setRecommendationGrid((current) =>
      current.map((variant) => (variant.id === variantId ? { ...variant, ...patch } : variant)),
    );
  };

  const resetSession = () => {
    setGenerationId(null);
    setRecommendationGrid([]);
    setSelectedVariantId(null);
    setProgress(0);
    setGridGenerationProgress(0);
    setPipelineStage("idle");
    setPipelineMessage("고객 사진과 생성 동의를 확인해 주세요.");
    setPipelineError(null);
    setMessage(null);
    setError(null);
  };

  const handleSelectFile = async (file: File) => {
    if (isAdminReadOnly) {
      return;
    }

    setIsUploading(true);
    setError(null);
    setMessage(null);

    try {
      const result = await validateImage(file);
      if (!result.ok) {
        setError("정면 얼굴 사진을 다시 확인해 주세요.");
        return;
      }

      const webpFile = await convertImageFileToWebp(file);
      setOriginalImage(webpFile);
      setPreviewUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return URL.createObjectURL(webpFile);
      });
      resetSession();
    } finally {
      setIsUploading(false);
    }
  };

  const requestImageGeneration = async (payload: {
    generationId: string;
    variantIndex: number;
    variantId: string;
    catalogItemId?: string;
    variantLabel: string;
    prompt: string;
    promptArtifactToken: string;
    imageDataUrl: string;
  }) => {
    const response = await fetch("/api/generations/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text().catch(() => "");
    let parsed: unknown = null;
    if (responseText) {
      try {
        parsed = JSON.parse(responseText) as unknown;
      } catch {
        parsed = null;
      }
    }

    const result = isRecord(parsed) ? (parsed as GenerationApiResponse) : {};
    const apiError = typeof result.error === "string" ? result.error : "";
    if (!response.ok) {
      const status = typeof result.status === "number" ? result.status : response.status;
      const code = typeof result.code === "string" ? result.code : undefined;
      if (code === INSUFFICIENT_CREDITS_CODE || (status === 409 && apiError.toLowerCase().includes("credit"))) {
        throw new GenerationApiError({ message: INSUFFICIENT_CREDITS_MESSAGE, status, code: INSUFFICIENT_CREDITS_CODE });
      }

      throw new GenerationApiError({
        message: apiError ? `${apiError} (HTTP ${status})` : `헤어 후보 생성에 실패했습니다. HTTP ${status}`,
        status,
        code,
      });
    }

    if (!result.id || !result.variantId) {
      throw new Error(apiError || "Generation response is missing required identifiers.");
    }

    const webpOutputUrl = result.outputUrl
      ? (await convertImageSrcToWebpDataUrl(result.outputUrl)) || result.outputUrl
      : null;

    return {
      id: result.id,
      variantId: result.variantId,
      variantIndex: result.variantIndex ?? payload.variantIndex,
      outputUrl: webpOutputUrl,
      generatedImagePath: result.generatedImagePath || null,
      evaluation: result.evaluation || null,
    };
  };

  const handleGenerate = async () => {
    if (!originalImage || isGenerating || isAdminReadOnly) return;
    if (!styleTarget) {
      setError("고객 스타일 타깃을 선택해 주세요.");
      return;
    }
    if (!photoConsentConfirmed) {
      setError("고객 사진 사용 동의를 확인해 주세요.");
      return;
    }

    setIsGenerating(true);
    setProgress(5);
    setGridGenerationProgress(0);
    setSelectedVariantId(null);
    setRecommendationGrid([]);
    setError(null);
    setMessage(null);
    setPipelineError(null);

    try {
      setPipelineState("validating", "고객 사진을 생성용 이미지로 준비하고 있습니다.");
      const referenceImageDataUrl = await fileToDataUrl(originalImage);
      setProgress(15);

      setPipelineState("analyzing_face", "고객 얼굴형과 두상 밸런스를 분석하고 있습니다.");
      const response = await fetch(`/api/salon/customers/${customerId}/workspace/recommendations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceImageDataUrl,
          styleTarget,
          photoConsentConfirmed,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as RecommendationApiResponse;
      if (!response.ok) {
        throw new Error(data.error || "살롱 헤어 추천 보드를 만들지 못했습니다.");
      }
      if (!data.generationId || !data.recommendations?.length) {
        throw new Error("추천 응답이 완전하지 않습니다.");
      }

      const nextGenerationId = data.generationId;
      const recommendations = data.recommendations;
      setGenerationId(nextGenerationId);
      setRecommendationGrid(recommendations.map(toGeneratedVariant));
      setPipelineState("building_grid", "3x3 헤어 후보 보드를 준비했습니다.");
      setProgress(30);

      const total = recommendations.length;
      let settledCount = 0;
      let completedCount = 0;
      const failedMessages: string[] = [];
      let insufficientCreditsSeen = false;

      setPipelineState("generating_image", "헤어 후보 이미지를 렌더링하고 있습니다.");

      await runStaggeredPool(recommendations, async (candidate, index) => {
        const finishVariant = () => {
          settledCount += 1;
          const percent = Math.round((settledCount / total) * 100);
          setGridGenerationProgress(percent);
          setProgress(30 + Math.round(percent * 0.6));
        };

        if (!candidate.promptArtifactToken) {
          failedMessages.push("Missing prompt artifact token.");
          updateVariant(candidate.id, { status: "failed", error: "Missing prompt artifact token." });
          finishVariant();
          return;
        }

        try {
          for (let attempt = 1; attempt <= VARIANT_MAX_ATTEMPTS; attempt += 1) {
            const isRetry = attempt > 1;
            setPipelineState(
              "generating_image",
              `${isRetry ? "재시도" : "생성"} 중: ${index + 1}/${total} 후보`,
            );
            updateVariant(candidate.id, { status: "generating", error: null });

            try {
              const result = await requestImageGeneration({
                generationId: nextGenerationId,
                variantIndex: index,
                variantId: candidate.id,
                catalogItemId: candidate.catalogItemId,
                variantLabel: candidate.label,
                prompt: candidate.prompt,
                promptArtifactToken: candidate.promptArtifactToken,
                imageDataUrl: referenceImageDataUrl,
              });

              completedCount += 1;
              updateVariant(candidate.id, {
                status: "completed",
                outputUrl: result.outputUrl,
                generatedImagePath: result.generatedImagePath,
                evaluation: result.evaluation,
                error: null,
                generatedAt: new Date().toISOString(),
              });
              return;
            } catch (error) {
              const nextError = toErrorMessage(error, "후보 생성에 실패했습니다.");
              if (isInsufficientCreditsError(error)) {
                insufficientCreditsSeen = true;
                failedMessages.push(nextError);
                updateVariant(candidate.id, { status: "failed", error: nextError });
                return;
              }

              if (attempt < VARIANT_MAX_ATTEMPTS) {
                updateVariant(candidate.id, { status: "generating", error: `${nextError} 재시도 중...` });
                await sleep(VARIANT_RETRY_DELAY_MS);
                continue;
              }

              failedMessages.push(nextError);
              updateVariant(candidate.id, { status: "failed", error: nextError });
            }
          }
        } finally {
          finishVariant();
        }
      });

      setPipelineState("finalizing", "살롱 상담 보드를 정리하고 있습니다.");
      setProgress(95);

      if (completedCount === 0) {
        throw new Error(insufficientCreditsSeen ? INSUFFICIENT_CREDITS_MESSAGE : summarizeVariantFailures(failedMessages));
      }

      setPipelineState("completed", "살롱 헤어 상담 보드가 준비되었습니다.");
      setProgress(100);
      setCurrentStep("select");
    } catch (error) {
      const nextError = toErrorMessage(error, "살롱 헤어 생성 파이프라인이 실패했습니다.");
      setPipelineError(nextError);
      setPipelineStage("failed");
      setPipelineMessage(nextError);
      setProgress(0);
      setError(nextError);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleConfirm = async () => {
    if (!generationId || !selectedVariantId || isConfirming || isAdminReadOnly) return;

    setIsConfirming(true);
    setError(null);
    setMessage(null);

    const response = await fetch(`/api/salon/customers/${customerId}/workspace/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generationId,
        selectedVariantId,
        serviceType,
        serviceDate,
        nextRecommendedVisitAt: nextRecommendedVisitAt || null,
        memo,
        createAftercare,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as ConfirmResponse;

    if (response.ok) {
      setMessage("CRM 상담/시술 기록으로 저장했습니다.");
      router.push(data.redirectTo || `/salon/customers/${customerId}`);
    } else {
      setError(data.error || "CRM 기록 저장에 실패했습니다.");
    }

    setIsConfirming(false);
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 pb-20 pt-6 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-[var(--app-border)] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href={`/salon/customers/${customerId}`} className="inline-flex items-center gap-2 text-sm font-bold text-[var(--app-muted)] hover:text-[var(--app-text)]">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            고객 상세
          </Link>
          <p className="app-kicker mt-4">Salon Workspace</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--app-text)]">
            {customer?.name || "고객"} 헤어 상담 보드
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
            고객 사진 기반으로 헤어 후보를 만들고 선택 결과를 CRM 상담/시술 기록에 저장합니다.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:min-w-[420px]">
          <SurfaceCard className="px-3 py-2">
            <p className="text-xs text-[var(--app-muted)]">고객 타깃</p>
            <p className="mt-1 text-lg font-black text-[var(--app-text)]">{styleTargetLabel(styleTarget || null)}</p>
          </SurfaceCard>
          <SurfaceCard className="px-3 py-2">
            <p className="text-xs text-[var(--app-muted)]">완료</p>
            <p className="mt-1 text-lg font-black text-[var(--app-text)]">{completedCount}</p>
          </SurfaceCard>
          <SurfaceCard className="px-3 py-2">
            <p className="text-xs text-[var(--app-muted)]">대기/실패</p>
            <p className="mt-1 text-lg font-black text-[var(--app-text)]">{readyCount}/{failedCount}</p>
          </SurfaceCard>
        </div>
      </header>

      {isAdminReadOnly ? (
        <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          Admin read-only mode: 살롱 오너 계정에서 생성과 저장을 진행해 주세요.
        </div>
      ) : null}
      {error ? <div className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div> : null}
      {message ? <div className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</div> : null}

      <section className="grid gap-2 md:grid-cols-3">
        {steps.map((step) => (
          <StepButton
            key={step.id}
            currentStep={currentStep}
            enabled={step.id === "upload" || (step.id === "generate" && canOpenGenerate) || (step.id === "select" && canOpenSelect)}
            onClick={setCurrentStep}
            step={step}
          />
        ))}
      </section>

      {currentStep === "upload" ? (
        <Panel as="section" className="grid gap-5 p-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:p-5">
          <div className="space-y-4">
            <div>
              <p className="app-kicker">1단계</p>
              <h2 className="mt-2 text-2xl font-black text-[var(--app-text)]">사진, 타깃, 동의 확인</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
                살롱 고객용 보드는 헤어 추천만 생성하며 패션/퍼스널컬러 단계로 이동하지 않습니다.
              </p>
            </div>
            <fieldset disabled={isAdminReadOnly} className="grid gap-4 disabled:opacity-70">
              <div className="grid gap-2">
                <p className="text-sm font-black text-[var(--app-text)]">고객 스타일 타깃</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["male", "female"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setStyleTarget(value)}
                      className={cn(
                        "min-h-11 rounded-[var(--app-radius-control)] border px-4 py-2 text-sm font-black transition",
                        styleTarget === value
                          ? "border-[var(--app-border-strong)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)]"
                          : "border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] hover:border-[var(--app-border-strong)]",
                      )}
                    >
                      {styleTargetLabel(value)}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-start gap-3 border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-3 text-sm leading-6 text-[var(--app-text)]">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={photoConsentConfirmed}
                  onChange={(event) => setPhotoConsentConfirmed(event.target.checked)}
                />
                <span>
                  고객에게 사진을 AI 헤어스타일 생성과 CRM 상담 기록 저장에 사용하는 것에 대한 동의를 확인했습니다.
                  {customer?.photoGenerationConsentAt ? (
                    <span className="mt-1 block text-xs text-[var(--app-muted)]">
                      기존 동의 기록: {new Date(customer.photoGenerationConsentAt).toLocaleString("ko-KR")}
                    </span>
                  ) : null}
                </span>
              </label>

              {previewUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setOriginalImage(null);
                    setPreviewUrl((current) => {
                      if (current) URL.revokeObjectURL(current);
                      return null;
                    });
                    resetSession();
                    resetValidation();
                  }}
                >
                  사진 다시 선택
                </Button>
              ) : null}
            </fieldset>
          </div>

          <div className="mx-auto w-full max-w-xl">
            <UploadArea
              onSelectFile={handleSelectFile}
              disabled={isUploading || isAdminReadOnly}
              previewUrl={previewUrl}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" onClick={() => setCurrentStep("generate")} disabled={!canOpenGenerate}>
                생성 단계로 이동
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}

      {currentStep === "generate" ? (
        <Panel as="section" className="overflow-hidden">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <div className="relative min-h-[560px] bg-[var(--app-surface-muted)] lg:min-h-[640px]">
              {previewUrl ? (
                <Image src={previewUrl} alt="업로드한 고객 정면 사진" fill unoptimized className="object-contain" />
              ) : (
                <div className="flex min-h-[560px] items-center justify-center px-6 text-center text-sm text-[var(--app-muted)] lg:min-h-[640px]">
                  먼저 고객 사진을 업로드해 주세요.
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
                <h2 className="mt-2 text-2xl font-black text-[var(--app-text)]">3x3 헤어 후보 생성</h2>
                <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
                  선택한 고객 타깃과 사진 분석 결과로 살롱 상담용 헤어 후보만 생성합니다.
                </p>
                <SurfaceCard className="mt-5 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase text-[var(--app-muted)]">보드 진행률</p>
                      <p className="mt-1 text-2xl font-black text-[var(--app-text)]">{gridGenerationProgress}%</p>
                    </div>
                    <Wand2 className="h-7 w-7 text-[var(--app-accent-strong)]" aria-hidden="true" />
                  </div>
                </SurfaceCard>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={handleGenerate} disabled={!canOpenGenerate || isGenerating || isAdminReadOnly}>
                  {isGenerating ? "생성 중" : generationId ? "다시 생성" : "생성 시작"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setCurrentStep("upload")}>
                  사진/타깃 변경
                </Button>
                {canOpenSelect ? (
                  <Button type="button" variant="ghost" onClick={() => setCurrentStep("select")}>
                    후보 보기
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </Panel>
      ) : null}

      {currentStep === "select" ? (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Panel as="section" className="p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="app-kicker">3단계</p>
                <h2 className="mt-2 text-2xl font-black text-[var(--app-text)]">스타일 선택 및 CRM 저장</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
                  선택한 헤어를 고객 방문 기록에 연결하면 CRM 타임라인에서 다시 확인할 수 있습니다.
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={handleGenerate} disabled={!canOpenGenerate || isGenerating || isAdminReadOnly}>
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                다시 생성
              </Button>
            </div>

            {recommendationGrid.length === 0 ? (
              <SurfaceCard className="mt-5 border-dashed px-5 py-10 text-center">
                <Wand2 className="mx-auto h-9 w-9 text-[var(--app-subtle)]" aria-hidden="true" />
                <p className="mt-3 text-sm font-bold text-[var(--app-text)]">아직 생성된 후보가 없습니다.</p>
                <Button type="button" className="mt-4" onClick={() => setCurrentStep(previewUrl ? "generate" : "upload")}>
                  생성 단계로 이동
                </Button>
              </SurfaceCard>
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {recommendationGrid.map((variant) => (
                  <VariantCard
                    key={variant.id}
                    disabled={!variant.outputUrl || isConfirming}
                    isSelected={selectedVariantId === variant.id}
                    onSelect={(nextVariant) => setSelectedVariantId(nextVariant.id)}
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
                  {selectedVariant ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : <UserRound className="h-5 w-5" aria-hidden="true" />}
                </span>
                <div>
                  <p className="text-sm font-black text-[var(--app-text)]">
                    {selectedVariant ? selectedVariant.label : "선택한 헤어가 없습니다"}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-[var(--app-muted)]">
                    {selectedVariant ? selectedVariant.reason : "완료된 후보를 선택하면 CRM 저장 폼이 활성화됩니다."}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                <label className="grid gap-1 text-sm font-bold text-[var(--app-text)]">
                  시술 종류
                  <select
                    value={serviceType}
                    onChange={(event) => setServiceType(event.target.value as SalonServiceType)}
                    className="app-input h-11 px-3"
                  >
                    {serviceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-bold text-[var(--app-text)]">
                  시술/상담일
                  <input
                    type="date"
                    value={serviceDate}
                    onChange={(event) => setServiceDate(event.target.value)}
                    className="app-input h-11 px-3"
                  />
                </label>
                <label className="grid gap-1 text-sm font-bold text-[var(--app-text)]">
                  다음 추천 연락
                  <input
                    type="datetime-local"
                    value={nextRecommendedVisitAt}
                    onChange={(event) => setNextRecommendedVisitAt(event.target.value)}
                    className="app-input h-11 px-3"
                  />
                </label>
                <label className="grid gap-1 text-sm font-bold text-[var(--app-text)]">
                  내부 메모
                  <textarea
                    value={memo}
                    onChange={(event) => setMemo(event.target.value)}
                    rows={4}
                    className="app-input px-3 py-2"
                    placeholder="상담 중 확인한 요청사항"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm font-bold text-[var(--app-text)]">
                  <input
                    type="checkbox"
                    checked={createAftercare}
                    onChange={(event) => setCreateAftercare(event.target.checked)}
                  />
                  다음 추천 연락으로 사후관리 생성
                </label>

                {generationId && selectedVariantId ? (
                  <Link
                    href={`/result/${generationId}?variant=${encodeURIComponent(selectedVariantId)}`}
                    className="inline-flex min-h-10 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-2 text-sm font-bold uppercase tracking-[0.04em] text-[var(--app-text)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-muted)]"
                  >
                    결과 페이지 보기
                  </Link>
                ) : null}
                <Button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!generationId || !selectedVariantId || isConfirming || isAdminReadOnly}
                >
                  <Scissors className="mr-2 h-4 w-4" aria-hidden="true" />
                  {isConfirming ? "저장 중" : "CRM 기록 저장"}
                </Button>
              </div>
            </Panel>
          </aside>
        </section>
      ) : null}
    </div>
  );
}
