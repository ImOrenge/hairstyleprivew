"use client";

/* eslint-disable @next/next/no-img-element */

import { useClerk } from "@clerk/nextjs";
import {
  getGenerationJobProgressPresentation,
  getGenerationCreditReceiptPresentation,
  normalizeGenerationCreditReceipt,
  type GenerationCreditReceipt,
  type GenerationOriginalRetentionState,
  type GenerationWorkflowDispatchStatus,
} from "@hairfit/shared";
import { createGenerationResumeTarget, resumeTargetToPath } from "@hairfit/shared/auth/resume-target";
import { useEffect, useMemo, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { Button } from "../../../components/ui/Button";
import { AppPage, Panel, SurfaceCard } from "../../../components/ui/Surface";
import { GenerationJobProgressCard } from "../../../components/generate/GenerationJobProgressCard";
import { ConfirmActionDialog } from "../../../components/ui/ConfirmActionDialog";
import { useGenerate } from "../../../hooks/useGenerate";
import { useResultTranslations } from "../../../hooks/useResultTranslations";
import { useAuthenticatedFetch } from "../../../hooks/useAuthenticatedFetch";
import { normalizeGenerationRetryPath } from "../../../lib/generation-retry-path";
import type { GeneratedVariant, RecommendationSet } from "../../../lib/recommendation-types";
import { mapWebUserError, UserSafeError } from "../../../lib/web-user-message";
import { useGenerationStore } from "../../../store/useGenerationStore";

interface GenerationDetailsResponse {
  status?: string;
  updatedAt?: string | null;
  acceptedAt?: string | null;
  preparationStatus?: "queued" | "preparing" | "retry" | "ready" | "failed";
  preparationError?: string | null;
  error?: string | null;
  creditReceipt?: unknown;
  creditReceiptUnavailable?: boolean;
  retryPath?: string;
  originalRetention?: GenerationOriginalRetentionState;
  recommendationSet?: RecommendationSet | null;
}

interface GenerationStatusResponse {
  status?: string;
  terminal?: boolean;
  updatedAt?: string | null;
  acceptedAt?: string | null;
  preparationStatus?: "queued" | "preparing" | "retry" | "ready" | "failed";
  preparationError?: string | null;
  variants?: {
    total: number;
    completed: number;
    failed: number;
  };
  workflowDispatch?: {
    status: GenerationWorkflowDispatchStatus;
  } | null;
  creditReceipt?: unknown;
  creditReceiptUnavailable?: boolean;
  retryPath?: string;
  originalRetention?: GenerationOriginalRetentionState;
  error?: string;
}

type GenerationAccessIssue = "unauthenticated" | "forbidden";

class GenerationAccessError extends UserSafeError {
  readonly issue: GenerationAccessIssue;

  constructor(issue: GenerationAccessIssue) {
    super(
      issue === "unauthenticated"
        ? "로그인이 만료되었습니다. 다시 로그인하면 이 생성 결과로 돌아옵니다."
        : "이 생성 결과를 볼 수 없는 계정입니다. 완료 안내를 받은 계정으로 다시 로그인해 주세요.",
    );
    this.name = "GenerationAccessError";
    this.issue = issue;
  }
}

function throwGenerationAccessError(status: number) {
  if (status === 401) throw new GenerationAccessError("unauthenticated");
  if (status === 403) throw new GenerationAccessError("forbidden");
}

function preserveSignedVariantUrls(
  current: RecommendationSet | null,
  next: RecommendationSet,
): RecommendationSet {
  if (!current) return next;
  const currentById = new Map(current.variants.map((variant) => [variant.id, variant]));
  return {
    ...next,
    variants: next.variants.map((variant) => {
      const previous = currentById.get(variant.id);
      return previous?.outputUrl && previous.generatedImagePath === variant.generatedImagePath
        ? { ...variant, outputUrl: previous.outputUrl }
        : variant;
    }),
  };
}

function isRenderableVariant(variant: GeneratedVariant) {
  return Boolean(variant.outputUrl || variant.generatedImagePath || variant.status === "completed");
}

function scoreTone(score: number | null) {
  if (score === null) {
    return "bg-[var(--app-surface-muted)] text-[var(--app-muted)]";
  }

  if (score >= 85) {
    return "bg-emerald-100 text-emerald-700";
  }

  if (score >= 70) {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-rose-100 text-rose-700";
}

function formatLengthBucket(lengthBucket: GeneratedVariant["lengthBucket"]) {
  if (lengthBucket === "short") return "짧은 기장";
  if (lengthBucket === "medium") return "중간 기장";
  return "긴 기장";
}

function formatCorrectionFocus(correctionFocus: GeneratedVariant["correctionFocus"]) {
  if (correctionFocus === "crown") return "정수리 볼륨";
  if (correctionFocus === "temple") return "관자 균형";
  return "턱선 보완";
}

function formatRetentionDeadline(value: string | null) {
  if (!value) return "접수 후 24시간";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "접수 후 24시간";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function GenerateBoardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { signOut } = useClerk();
  const authenticatedFetch = useAuthenticatedFetch();
  const { retryRecommendationVariant } = useGenerate();

  const id = params?.id || "unknown";
  const resumeTarget = useMemo(() => createGenerationResumeTarget(id), [id]);
  const generationReturnPath = resumeTargetToPath(resumeTarget) ?? "/home";
  const signInRedirectUrl = `/login?redirect_url=${encodeURIComponent(generationReturnPath)}`;
  const hydrateOriginalImage = useGenerationStore((state) => state.hydrateOriginalImage);
  const storeGenerationId = useGenerationStore((state) => state.generationId);
  const storeGrid = useGenerationStore((state) => state.recommendationGrid);
  const storeAnalysisSummary = useGenerationStore((state) => state.analysisSummary);
  const storeSelectedVariantId = useGenerationStore((state) => state.selectedVariantId);
  const setSelectedVariantId = useGenerationStore((state) => state.setSelectedVariantId);

  const [recommendationSet, setRecommendationSet] = useState<RecommendationSet | null>(null);
  const [generationStatus, setGenerationStatus] = useState<string>("queued");
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);
  const [preparationStatus, setPreparationStatus] = useState<
    "queued" | "preparing" | "retry" | "ready" | "failed"
  >("ready");
  const [creditReceipt, setCreditReceipt] = useState<GenerationCreditReceipt | null>(null);
  const [creditReceiptUnavailable, setCreditReceiptUnavailable] = useState(false);
  const [generationRetryPath, setGenerationRetryPath] = useState("/generate");
  const [originalRetention, setOriginalRetention] = useState<GenerationOriginalRetentionState | null>(null);
  const [abandonRetryDialogOpen, setAbandonRetryDialogOpen] = useState(false);
  const [abandoningRetry, setAbandoningRetry] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accessIssue, setAccessIssue] = useState<GenerationAccessIssue | null>(null);
  const [retryingVariantId, setRetryingVariantId] = useState<string | null>(null);
  const [workflowDispatchStatus, setWorkflowDispatchStatus] =
    useState<GenerationWorkflowDispatchStatus | null>(null);
  const [statusVariantCounts, setStatusVariantCounts] = useState<{
    total: number;
    completed: number;
    failed: number;
  } | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [statusRefreshNonce, setStatusRefreshNonce] = useState(0);
  const [isOpening, startOpening] = useTransition();

  const storeBackedSet = useMemo<RecommendationSet | null>(() => {
    if (storeGenerationId !== id || storeGrid.length === 0 || !storeAnalysisSummary) {
      return null;
    }

    return {
      generatedAt: new Date().toISOString(),
      analysis: storeAnalysisSummary,
      variants: storeGrid,
      selectedVariantId: storeSelectedVariantId,
    };
  }, [id, storeAnalysisSummary, storeGenerationId, storeGrid, storeSelectedVariantId]);

  useEffect(() => {
    void hydrateOriginalImage();
  }, [hydrateOriginalImage]);

  useEffect(() => {
    let active = true;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let lastUpdatedAt = "";

    async function fetchGenerationDetail() {
      if (!id || id === "unknown") {
        return false;
      }

      const response = await authenticatedFetch(`/api/generations/${encodeURIComponent(id)}`, {
        method: "GET",
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as GenerationDetailsResponse | null;
      if (!response.ok) {
        throwGenerationAccessError(response.status);
        throw new Error(data?.error || "생성 상태를 불러오지 못했습니다.");
      }
      if (!active) return false;

      setAccessIssue(null);
      setLoadError(null);
      setGenerationStatus(data?.status || "queued");
      setAcceptedAt(data?.acceptedAt || null);
      setPreparationStatus(data?.preparationStatus || "ready");
      setCreditReceipt(
        data?.creditReceipt == null
          ? null
          : normalizeGenerationCreditReceipt(data.creditReceipt),
      );
      setCreditReceiptUnavailable(Boolean(data?.creditReceiptUnavailable));
      setGenerationRetryPath(normalizeGenerationRetryPath(data?.retryPath));
      if (data?.originalRetention) setOriginalRetention(data.originalRetention);
      if (data?.updatedAt) lastUpdatedAt = data.updatedAt;
      if (data?.recommendationSet) {
        setRecommendationSet((current) => preserveSignedVariantUrls(current, data.recommendationSet!));
      }
      return data?.status === "completed" || data?.status === "failed";
    }

    async function pollGenerationStatus() {
      try {
        const response = await authenticatedFetch(`/api/generations/${encodeURIComponent(id)}/status`, {
          cache: "no-store",
        });
        const data = (await response.json().catch(() => null)) as GenerationStatusResponse | null;
        if (!response.ok) {
          throwGenerationAccessError(response.status);
          throw new Error(data?.error || "생성 상태를 불러오지 못했습니다.");
        }
        if (!active) return;

        setGenerationStatus(data?.status || "queued");
        setAcceptedAt(data?.acceptedAt || null);
        setPreparationStatus(data?.preparationStatus || "ready");
        setWorkflowDispatchStatus(data?.workflowDispatch?.status || null);
        if (data?.variants) setStatusVariantCounts(data.variants);
        setLastCheckedAt(new Date());
        setIsRefreshingStatus(false);
        if (data?.creditReceipt !== undefined) {
          setCreditReceipt(
            data.creditReceipt == null
              ? null
              : normalizeGenerationCreditReceipt(data.creditReceipt),
          );
        }
        setCreditReceiptUnavailable(Boolean(data?.creditReceiptUnavailable));
        if (data?.retryPath !== undefined) {
          setGenerationRetryPath(normalizeGenerationRetryPath(data.retryPath));
        }
        if (data?.originalRetention) setOriginalRetention(data.originalRetention);
        const changed = Boolean(data?.updatedAt && data.updatedAt !== lastUpdatedAt);
        if (changed || data?.terminal) {
          await fetchGenerationDetail();
        }
        if (active && !data?.terminal) {
          pollTimer = setTimeout(pollGenerationStatus, 3500);
        }
      } catch (error) {
        if (!active) return;
        if (error instanceof GenerationAccessError) {
          setAccessIssue(error.issue);
          setLoadError(mapWebUserError(error, "생성 상태를 불러오지 못했습니다."));
          setIsRefreshingStatus(false);
          return;
        }
        setLoadError(mapWebUserError(error, "생성 상태를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
        setIsRefreshingStatus(false);
        pollTimer = setTimeout(pollGenerationStatus, 6000);
      }
    }

    void fetchGenerationDetail()
      .then((terminal) => {
        if (active && !terminal) void pollGenerationStatus();
        if (active && terminal) setIsRefreshingStatus(false);
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof GenerationAccessError) {
          setAccessIssue(error.issue);
          setLoadError(mapWebUserError(error, "생성 상태를 불러오지 못했습니다."));
          setIsRefreshingStatus(false);
          return;
        }
        setLoadError(mapWebUserError(error, "생성 상태를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
        setIsRefreshingStatus(false);
        pollTimer = setTimeout(pollGenerationStatus, 6000);
      });

    return () => {
      active = false;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [authenticatedFetch, id, statusRefreshNonce]);

  const activeSet = recommendationSet || storeBackedSet;
  const variants = activeSet?.variants || [];
  const { translate } = useResultTranslations([
    activeSet?.analysis.faceShape,
    activeSet?.analysis.summary,
    activeSet?.analysis.balance,
    activeSet?.analysis.bestLengthStrategy,
    ...(activeSet?.analysis.volumeFocus || []),
    activeSet?.analysis.foreheadExposure,
    ...variants.flatMap((variant) => [variant.label, variant.reason, ...variant.tags]),
  ]);
  const completedCount = variants.filter((variant) => variant.status === "completed").length;
  const failedCount = variants.filter((variant) => variant.status === "failed").length;
  const readyCount = variants.filter(isRenderableVariant).length;
  const authoritativeCounts = statusVariantCounts || {
    total: variants.length,
    completed: completedCount,
    failed: failedCount,
  };
  const selectedVariantId = activeSet?.selectedVariantId || storeSelectedVariantId || null;
  const backgroundGenerationPending = generationStatus !== "completed" && generationStatus !== "failed";
  const creditReceiptPresentation = getGenerationCreditReceiptPresentation(
    creditReceipt?.state,
  );
  const freeRetryAvailable = Boolean(
    originalRetention?.retryAvailable && creditReceipt?.state !== "refunded",
  );
  const jobProgress = getGenerationJobProgressPresentation({
    status: generationStatus,
    acceptedAt,
    preparationStatus,
    workflowDispatchStatus,
    totalVariantCount: authoritativeCounts.total,
    completedVariantCount: authoritativeCounts.completed,
    failedVariantCount: authoritativeCounts.failed,
  });

  const refreshGenerationStatus = () => {
    setIsRefreshingStatus(true);
    setStatusRefreshNonce((value) => value + 1);
  };

  const reauthenticateForGeneration = async () => {
    if (accessIssue === "forbidden") {
      try {
        await signOut({ redirectUrl: signInRedirectUrl });
      } catch {
        setLoadError("계정 전환을 시작하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.");
      }
      return;
    }

    router.push(signInRedirectUrl);
  };

  if (accessIssue) {
    return (
      <AppPage className="flex flex-col gap-6 pb-24">
        <Panel className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6" role="alert">
          <p className="app-kicker">계정 확인 필요</p>
          <h1 className="text-3xl font-black tracking-tight text-[var(--app-text)]">
            {accessIssue === "forbidden"
              ? "이 계정의 생성 결과가 아닙니다"
              : "다시 로그인해 주세요"}
          </h1>
          <p className="text-sm leading-6 text-[var(--app-muted)]">
            {loadError}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void reauthenticateForGeneration()}>
              {accessIssue === "forbidden" ? "다른 계정으로 로그인" : "다시 로그인"}
            </Button>
            <Button variant="secondary" onClick={() => router.push("/home")}>홈으로 이동</Button>
          </div>
        </Panel>
      </AppPage>
    );
  }

  const handleSelectVariant = (variant: GeneratedVariant) => {
    if (!id || !variant.outputUrl) {
      return;
    }

    startOpening(() => {
      setSelectedVariantId(variant.id);
      void authenticatedFetch(`/api/generations/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ selectedVariantId: variant.id }),
      })
        .then(async (response) => {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          if (!response.ok) {
            throwGenerationAccessError(response.status);
            throw new Error(data.error || "선택한 헤어를 저장하지 못했습니다.");
          }
          router.push(`/result/${id}?variant=${encodeURIComponent(variant.id)}`);
        })
        .catch((error) => {
          if (error instanceof GenerationAccessError) {
            setAccessIssue(error.issue);
            setLoadError(mapWebUserError(error, "선택한 헤어를 저장하지 못했습니다."));
            return;
          }
          setLoadError(mapWebUserError(error, "선택한 헤어를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."));
        });
    });
  };

  const handleRetryVariant = async (variant: GeneratedVariant) => {
    if (creditReceipt?.state === "refunded") {
      setLoadError("전체 실패로 크레딧이 복구되었습니다. 새 사진 접수로 다시 생성해 주세요.");
      return;
    }
    if (backgroundGenerationPending) {
      setLoadError("백그라운드 생성이 끝난 뒤 실패한 후보만 다시 시도할 수 있습니다.");
      return;
    }
    if (!freeRetryAvailable) {
      setLoadError("원본 사진의 보관기한이 끝났거나 삭제가 시작되어 무료 재시도를 이용할 수 없습니다.");
      return;
    }
    setRetryingVariantId(variant.id);

    try {
      await retryRecommendationVariant({
        generationId: id,
        variant,
      });
      setStatusRefreshNonce((value) => value + 1);
    } catch (error) {
      setLoadError(mapWebUserError(error, "실패한 후보를 다시 생성하지 못했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      setRetryingVariantId(null);
    }
  };

  const handleAbandonRetry = async () => {
    setAbandoningRetry(true);
    setLoadError(null);
    try {
      const response = await authenticatedFetch(`/api/generations/${encodeURIComponent(id)}/abandon-retry`, {
        method: "POST",
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        originalRetention?: GenerationOriginalRetentionState;
      } | null;
      if (!response.ok) {
        throwGenerationAccessError(response.status);
        throw new Error(data?.error || "무료 재시도 포기를 처리하지 못했습니다.");
      }
      if (data?.originalRetention) setOriginalRetention(data.originalRetention);
      setAbandonRetryDialogOpen(false);
    } catch (error) {
      if (error instanceof GenerationAccessError) {
        setAccessIssue(error.issue);
      }
      setLoadError(mapWebUserError(error, "무료 재시도 포기를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      setAbandoningRetry(false);
    }
  };

  return (
    <AppPage className="flex flex-col gap-6 pb-24">
      <header className="space-y-3">
        <p className="app-kicker">헤어 추천 보드</p>
        <Panel className="flex flex-col gap-4 p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <h1 className="text-3xl font-black tracking-tight text-[var(--app-text)]">나에게 맞춘 헤어스타일 결과</h1>
            <p className="max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
              {jobProgress.descriptionKo}
            </p>
            {loadError ? (
              <p role="alert" className="rounded-[var(--app-radius-control)] border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                {loadError}
              </p>
            ) : null}
            {preparationStatus === "failed" ? (
              <p role="alert" className="rounded-[var(--app-radius-control)] border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                사진 분석을 준비하지 못했습니다. 잠시 후 상태를 다시 확인하거나 새 사진으로 다시 접수해 주세요.
              </p>
            ) : null}
            {creditReceipt ? (
              <SurfaceCard className="space-y-1 px-4 py-3" role="status" aria-live="polite">
                <p className="text-sm font-black text-[var(--app-text)]">
                  {creditReceipt.state === "reserved"
                    ? `${creditReceipt.reservedCredits}크레딧 사용 예정`
                    : creditReceipt.state === "charged"
                      ? `${creditReceipt.chargedCredits}크레딧 차감 완료`
                      : `${creditReceipt.refundedCredits}크레딧 복구 완료`}
                </p>
                <p className="text-xs leading-5 text-[var(--app-muted)]">
                  {creditReceiptPresentation.descriptionKo}
                </p>
                <p className="text-xs font-semibold text-[var(--app-text)]">
                  {creditReceipt.state === "refunded"
                    ? `복구 직후 잔액 ${creditReceipt.balanceAfterRefund ?? "-"}크레딧`
                    : `작업 접수 직후 잔액 ${creditReceipt.balanceAfterReservation}크레딧`}
                </p>
              </SurfaceCard>
            ) : creditReceiptUnavailable ? (
              <p role="status" className="text-xs font-semibold text-amber-700">
                크레딧 처리 상태를 일시적으로 확인하지 못했습니다. 생성 결과에는 영향이 없으며 잠시 후 다시 확인해 주세요.
              </p>
            ) : null}
            {creditReceipt?.state === "refunded" ? (
              <Button type="button" onClick={() => router.push(generationRetryPath)}>
                새 사진으로 다시 생성
              </Button>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {(activeSet?.analysis.volumeFocus || []).map((item, index) => (
                <span key={item} className="app-chip px-3 py-1 text-xs font-medium">
                  {translate(item, `볼륨 포인트 ${index + 1}`)}
                </span>
              ))}
              {activeSet?.analysis.foreheadExposure ? (
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                  {translate(activeSet.analysis.foreheadExposure, "이마 노출 균형")}
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <SurfaceCard className="px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--app-muted)]">확인 가능</p>
              <p className="mt-1 text-2xl font-black text-[var(--app-text)]">{readyCount}</p>
            </SurfaceCard>
            <SurfaceCard className="px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--app-muted)]">완료</p>
              <p className="mt-1 text-2xl font-black text-[var(--app-text)]">{completedCount}</p>
            </SurfaceCard>
            <SurfaceCard className="px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--app-muted)]">실패</p>
              <p className="mt-1 text-2xl font-black text-[var(--app-text)]">{failedCount}</p>
            </SurfaceCard>
          </div>
        </Panel>
        <GenerationJobProgressCard
          presentation={jobProgress}
          lastCheckedAt={lastCheckedAt}
          refreshing={isRefreshingStatus}
          onRefresh={refreshGenerationStatus}
        />
        {failedCount > 0 && !backgroundGenerationPending && originalRetention ? (
          <SurfaceCard className="space-y-3 p-5" role="status">
            <div className="space-y-1">
              <p className="app-kicker">원본 사진과 무료 재시도</p>
              <h2 className="text-lg font-black text-[var(--app-text)]">
                {freeRetryAvailable
                  ? `${formatRetentionDeadline(originalRetention.expiresAt)}까지 무료 재시도 가능`
                  : creditReceipt?.state === "refunded" && originalRetention.status === "retained"
                    ? `${formatRetentionDeadline(originalRetention.expiresAt)} 이내 자동 삭제`
                  : originalRetention.status === "deleted"
                    ? "원본 삭제 완료"
                    : originalRetention.status === "cleanup_queued"
                      ? "원본 삭제 처리 중"
                      : "무료 재시도 기한 만료"}
              </h2>
              <p className="text-sm leading-6 text-[var(--app-muted)]">
                {freeRetryAvailable
                  ? "실패한 후보만 무료로 다시 시도할 수 있도록 원본을 비공개로 보관합니다. 포기하면 즉시 삭제를 요청하며 되돌릴 수 없습니다."
                  : creditReceipt?.state === "refunded" && originalRetention.status === "retained"
                    ? "전체 실패 크레딧이 복구되어 이 작업은 재시도하지 않습니다. 원본은 자동 삭제를 기다리거나 지금 삭제할 수 있습니다."
                  : "원본을 더 이상 새 생성에 사용하지 않습니다. 실패한 후보가 필요하면 새 사진으로 다시 접수해 주세요."}
              </p>
            </div>
            {originalRetention.status === "retained" && (freeRetryAvailable || creditReceipt?.state === "refunded") ? (
              <Button type="button" variant="secondary" onClick={() => setAbandonRetryDialogOpen(true)}>
                {freeRetryAvailable ? "무료 재시도 포기하고 원본 삭제" : "원본 사진 지금 삭제"}
              </Button>
            ) : null}
          </SurfaceCard>
        ) : null}
      </header>

      {activeSet?.analysis ? (
        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <SurfaceCard className="p-5">
            <p className="app-kicker">얼굴 분석 요약</p>
            <h2 className="mt-2 text-2xl font-black text-[var(--app-text)]">
              {translate(activeSet.analysis.faceShape, "얼굴형 분석")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
              {translate(activeSet.analysis.summary, "얼굴형과 전체 균형을 분석했습니다.")}
            </p>
          </SurfaceCard>

          <div className="grid gap-4 sm:grid-cols-2">
            <SurfaceCard className="p-5">
              <p className="app-kicker">두상 균형</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[var(--app-text)]">
                {translate(activeSet.analysis.balance, "전체 균형을 고려한 보완이 필요합니다.")}
              </p>
            </SurfaceCard>
            <SurfaceCard className="p-5">
              <p className="app-kicker">추천 기장</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[var(--app-text)]">
                {translate(activeSet.analysis.bestLengthStrategy, "얼굴 비율에 맞는 기장을 추천합니다.")}
              </p>
            </SurfaceCard>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {jobProgress.stage === "preparing" && variants.length === 0 ? (
          <SurfaceCard className="p-6 sm:col-span-2 xl:col-span-3">
            <p className="app-kicker">접수 완료</p>
            <h2 className="mt-2 text-xl font-black text-[var(--app-text)]">{jobProgress.labelKo}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
              {jobProgress.descriptionKo}
            </p>
          </SurfaceCard>
        ) : null}
        {variants.map((variant, index) => {
          const score = variant.evaluation?.score ?? null;
          const isSelected = selectedVariantId === variant.id;
          const displayLabel = translate(variant.label, `추천 스타일 ${variant.rank || index + 1}`);
          const displayReason = translate(
            variant.reason,
            "얼굴형과 전체 균형을 고려한 추천 스타일입니다.",
          );

          return (
            <motion.article
              data-pointer-glow="surface"
              key={variant.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: Math.min(index * 0.03, 0.2) }}
              className={`app-card overflow-hidden shadow-[0_18px_55px_-35px_rgba(0,0,0,0.25)] ${
                isSelected ? "border-stone-900" : "border-stone-200"
              }`}
            >
              <div className="relative aspect-[3/5] overflow-hidden bg-stone-100">
                {variant.outputUrl ? (
                  <img
                    src={variant.outputUrl}
                    alt={displayLabel}
                    className="h-full w-full object-contain"
                    decoding="async"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-[var(--app-surface-muted)] p-8 text-center text-sm text-[var(--app-muted)]">
                    {variant.status === "failed"
                      ? "이 헤어스타일 생성에 실패했습니다. 아래에서 다시 시도해 주세요."
                      : variant.status === "generating"
                        ? "헤어스타일 미리보기를 생성하고 있습니다."
                        : "생성 순서를 기다리고 있습니다."}
                  </div>
                )}

                <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-black/75 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
                    {formatLengthBucket(variant.lengthBucket)}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${scoreTone(score)}`}>
                    {score === null ? "평가 대기" : `평가 ${score}점`}
                  </span>
                </div>

                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-4 py-4 text-white">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
                    #{variant.rank} {formatCorrectionFocus(variant.correctionFocus)}
                  </p>
                  <h3 className="mt-1 text-xl font-black">{displayLabel}</h3>
                </div>
              </div>

              <div className="space-y-4 p-5">
                <p className="text-sm leading-6 text-[var(--app-muted)]">{displayReason}</p>

                <div className="flex flex-wrap gap-2">
                  {variant.tags.map((tag, tagIndex) => (
                    <span key={tag} className="app-chip px-3 py-1 text-xs font-medium">
                      {translate(tag, `스타일 특징 ${tagIndex + 1}`)}
                    </span>
                  ))}
                </div>

                {variant.status === "failed" ? (
                  <p className="rounded-2xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                    이 후보를 완성하지 못했습니다. 다른 결과는 그대로 두고 이 후보만 다시 시도할 수 있습니다.
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => handleSelectVariant(variant)}
                    disabled={!variant.outputUrl || isOpening}
                    className="rounded-2xl"
                  >
                    결과 열기
                  </Button>
                  {variant.status === "failed" ? (
                    <Button
                      variant="secondary"
                      onClick={() => handleRetryVariant(variant)}
                      disabled={
                        backgroundGenerationPending ||
                        creditReceipt?.state === "refunded" ||
                        !freeRetryAvailable ||
                        retryingVariantId === variant.id
                      }
                      className="rounded-2xl"
                    >
                      {backgroundGenerationPending
                        ? "백그라운드 생성 중"
                        : creditReceipt?.state === "refunded"
                          ? "새 생성 필요"
                          : !freeRetryAvailable
                            ? "재시도 종료"
                            : retryingVariantId === variant.id
                              ? "다시 시도하는 중..."
                              : "실패한 후보 다시 시도"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </motion.article>
          );
        })}
      </section>
      <ConfirmActionDialog
        open={abandonRetryDialogOpen}
        onOpenChange={setAbandonRetryDialogOpen}
        onConfirm={() => void handleAbandonRetry()}
        title={freeRetryAvailable ? "무료 재시도를 포기할까요?" : "원본 사진을 지금 삭제할까요?"}
        description={freeRetryAvailable
          ? "원본 사진 삭제를 즉시 요청합니다. 삭제 요청 이후에는 이 작업의 실패한 후보를 다시 생성할 수 없습니다."
          : "전체 실패 크레딧은 이미 복구되었습니다. 원본 사진 삭제를 지금 요청하면 자동 삭제 시각까지 기다리지 않습니다."}
        target="이 생성 작업의 원본 사진"
        beforeValue={freeRetryAvailable
          ? `${formatRetentionDeadline(originalRetention?.expiresAt ?? null)}까지 무료 재시도 가능`
          : `${formatRetentionDeadline(originalRetention?.expiresAt ?? null)} 이내 자동 삭제`}
        afterValue={freeRetryAvailable ? "무료 재시도 종료 · 원본 삭제" : "원본 즉시 삭제"}
        confirmLabel={freeRetryAvailable ? "포기하고 삭제" : "지금 삭제"}
        pendingLabel="삭제 요청 중…"
        isPending={abandoningRetry}
        tone="danger"
      />
    </AppPage>
  );
}
