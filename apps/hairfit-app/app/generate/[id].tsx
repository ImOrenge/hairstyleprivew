import { useAuth } from "@clerk/clerk-expo";
import {
  HairfitApiError,
  type GenerationStatus,
  type GenerationStatusResponse,
} from "@hairfit/api-client";
import {
  createGenerationResumeTarget,
  getGenerationCreditReceiptPresentation,
  getGenerationJobProgressPresentation,
  normalizeGenerationCreditReceipt,
  resolveGenerationResultSelection,
  type GeneratedVariant,
  type GenerationCreditReceipt,
  type GenerationOriginalRetentionState,
  type RecommendationSet,
} from "@hairfit/shared";
import { BodyText, Button, Card, Chip, Cluster, Divider, Heading, Kicker, Panel, Row, Stack, Stat } from "@hairfit/ui-native";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, Image, Linking, StyleSheet, View } from "react-native";
import { AppScreen } from "../../components/app/AppScreen";
import { useSafeBackNavigation } from "../../hooks/useSafeBackNavigation";
import { useMobileResultTranslations } from "../../hooks/useMobileResultTranslations";
import { getHairfitApiBaseUrl, useHairfitApi } from "../../lib/api";
import { buildAuthRoute, pendingResumeStore } from "../../lib/auth-resume";
import { useGenerationFlow } from "../../lib/generation-flow";
import { mapMobileUserError } from "../../lib/mobile-user-message";
import { GenerationJobProgressCard } from "../../components/generation/GenerationJobProgressCard";
import { useNetworkRecovery } from "../../components/app/NetworkRecoveryProvider";

interface GenerationDetail {
  id: string;
  status: GenerationStatus;
  updatedAt?: string | null;
  acceptedAt?: string | null;
  preparationStatus?: "queued" | "preparing" | "retry" | "ready" | "failed";
  preparationError?: string | null;
  creditReceipt?: GenerationCreditReceipt | null;
  creditReceiptUnavailable?: boolean;
  retryPath?: string;
  originalRetention?: GenerationOriginalRetentionState;
  recommendationSet: RecommendationSet | null;
  selectedVariant: GeneratedVariant | null;
  selectionLocked: boolean;
  confirmedHairRecord: { id: string } | null;
}

function normalizeDraftVariant(variant: GeneratedVariant): GeneratedVariant {
  return {
    ...variant,
    status: variant.status || "queued",
    outputUrl: variant.outputUrl ?? null,
    generatedImagePath: variant.generatedImagePath ?? null,
    evaluation: variant.evaluation ?? null,
    designerBrief: variant.designerBrief ?? null,
    error: variant.error ?? null,
    generatedAt: variant.generatedAt ?? null,
  };
}

function mergePromptTokens(variants: GeneratedVariant[], draftVariants: GeneratedVariant[]) {
  const draftById = new Map(draftVariants.map((variant) => [variant.id, variant]));
  return variants.map((variant) => {
    const draft = draftById.get(variant.id);
    return {
      ...variant,
      promptArtifactToken: variant.promptArtifactToken || draft?.promptArtifactToken,
    };
  });
}

function isRenderableVariant(variant: GeneratedVariant) {
  return Boolean(variant.outputUrl || variant.generatedImagePath || variant.status === "completed");
}

function evaluationScore(variant: GeneratedVariant) {
  const value = variant.evaluation;
  if (value && typeof value === "object" && "score" in value && typeof value.score === "number") {
    return value.score;
  }
  return null;
}

function statusTone(status: string): "neutral" | "accent" | "success" | "danger" {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  if (status === "generating") return "accent";
  return "neutral";
}

function variantStatusLabel(status: string) {
  if (status === "completed") return "완료";
  if (status === "failed") return "실패";
  if (status === "generating") return "생성 중";
  if (status === "queued") return "대기 중";
  return "상태 확인 중";
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

function formatRetentionDeadline(value: string | null | undefined) {
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

type GenerationAccessIssue = "unauthenticated" | "forbidden" | null;

function isBackgroundGenerationPending(status: GenerationStatus | undefined) {
  return status === "queued" || status === "processing";
}

function preserveSignedVariantUrls(
  current: RecommendationSet | null | undefined,
  next: RecommendationSet | null,
) {
  if (!current || !next) return next;
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

const selectionLockedMessage = "확정한 헤어는 변경할 수 없습니다. 다른 스타일은 새로 생성해 주세요.";

export default function GenerateBoardScreen() {
  const router = useRouter();
  const { isLoaded: isAuthLoaded, isSignedIn, signOut } = useAuth();
  const api = useHairfitApi();
  const { availability: networkAvailability, recoveryToken } = useNetworkRecovery();
  const flow = useGenerationFlow();
  const { id } = useLocalSearchParams<{ id: string }>();
  const routeGenerationId = typeof id === "string" ? id : "";
  const resumeTarget = useMemo(
    () => createGenerationResumeTarget(routeGenerationId),
    [routeGenerationId],
  );
  const generationId = resumeTarget?.kind === "generation" ? resumeTarget.generationId : "";
  const [detail, setDetail] = useState<GenerationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accessIssue, setAccessIssue] = useState<GenerationAccessIssue>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === "active");
  const [statusSnapshot, setStatusSnapshot] = useState<GenerationStatusResponse | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [pendingVariantId, setPendingVariantId] = useState<string | null>(null);
  const [openingVariantId, setOpeningVariantId] = useState<string | null>(null);
  const [isAbandoningRetry, setIsAbandoningRetry] = useState(false);
  const requestIdRef = useRef(0);
  const lastUpdatedAtRef = useRef("");
  const authRedirectStartedRef = useRef(false);
  const isVariantActionPending = Boolean(pendingVariantId || openingVariantId);
  const explainBlockedBack = useCallback(() => {
    setMessage("선택한 헤어 결과를 안전하게 처리하고 있습니다. 완료 안내가 표시된 뒤 이동해 주세요.");
  }, []);
  const navigateBack = useSafeBackNavigation({
    blocked: isVariantActionPending,
    fallback: "/mypage",
    mode: "replace",
    onBlocked: explainBlockedBack,
  });

  const draftSet = useMemo<RecommendationSet | null>(() => {
    if (!flow.draft || flow.draft.generationId !== generationId || flow.draft.recommendations.length === 0) {
      return null;
    }

    return {
      generatedAt: new Date().toISOString(),
      analysis: {
        faceShape: "",
        headShape: "",
        foreheadExposure: "",
        observedPartingShape: "",
        recommendedPartingShape: "",
        partingStrategy: "",
        balance: "",
        bestLengthStrategy: "",
        volumeFocus: [],
        avoidNotes: [],
        summary: "",
      },
      variants: flow.draft.recommendations.map(normalizeDraftVariant),
      selectedVariantId: null,
    };
  }, [flow.draft, generationId]);

  const returnToLogin = useCallback(async (clearCurrentSession = false) => {
    if (!resumeTarget || authRedirectStartedRef.current) return;
    authRedirectStartedRef.current = true;
    setAccessIssue("unauthenticated");
    setLoadError("로그인이 필요합니다. 인증을 마치면 이 생성 결과로 자동 복귀합니다.");
    setIsLoading(false);

    try {
      await pendingResumeStore.save(resumeTarget);
      if (clearCurrentSession && isSignedIn) {
        await signOut();
      }
    } finally {
      router.replace(buildAuthRoute("/login", resumeTarget) as Href);
    }
  }, [isSignedIn, resumeTarget, router, signOut]);

  const handleAccessError = useCallback(async (error: unknown) => {
    if (!(error instanceof HairfitApiError)) return false;

    if (error.status === 401) {
      await returnToLogin(true);
      return true;
    }

    if (error.status === 403) {
      setAccessIssue("forbidden");
      setDetail(null);
      setLoadError("이 생성 결과를 볼 수 없는 계정입니다. 완료 안내를 받은 계정으로 다시 로그인해 주세요.");
      setIsLoading(false);
      return true;
    }

    return false;
  }, [returnToLogin]);

  useEffect(() => {
    if (!isAuthLoaded) return;

    if (!resumeTarget) {
      setAccessIssue(null);
      setLoadError("올바르지 않은 생성 링크입니다. 내 기록에서 생성 결과를 다시 선택해 주세요.");
      setIsLoading(false);
      return;
    }

    if (!isSignedIn) {
      void returnToLogin();
      return;
    }

    authRedirectStartedRef.current = false;
    setAccessIssue(null);
    void pendingResumeStore.clear();
  }, [isAuthLoaded, isSignedIn, resumeTarget, returnToLogin]);

  const load = useCallback(async (showLoading = false) => {
    if (!isAuthLoaded || !isSignedIn) return;

    if (!resumeTarget || !generationId) {
      setLoadError("생성 번호가 없어 추천 보드를 불러올 수 없습니다.");
      setIsLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    if (showLoading) {
      setIsLoading(true);
      setLoadError(null);
    }

    try {
      const result = await api.getGeneration(generationId);
      if (requestId !== requestIdRef.current) return;
      const selection = resolveGenerationResultSelection({
        recommendationSet: result.recommendationSet,
        selectedVariant: result.selectedVariant,
        confirmedHairRecord: result.confirmedHairRecord,
      });
      setDetail((current) => ({
        id: result.id,
        status: result.status,
        updatedAt: result.updatedAt,
        acceptedAt: result.acceptedAt,
        preparationStatus: result.preparationStatus,
        preparationError: result.preparationError,
        creditReceipt:
          result.creditReceipt == null
            ? null
            : normalizeGenerationCreditReceipt(result.creditReceipt),
        creditReceiptUnavailable: Boolean(result.creditReceiptUnavailable),
        retryPath: result.retryPath || "/generate",
        originalRetention: result.originalRetention,
        recommendationSet: preserveSignedVariantUrls(
          current?.recommendationSet,
          result.recommendationSet,
        ),
        selectedVariant: result.selectedVariant,
        selectionLocked: selection.selectionLocked,
        confirmedHairRecord: result.confirmedHairRecord ?? null,
      }));
      if (result.updatedAt) lastUpdatedAtRef.current = result.updatedAt;
      setAccessIssue(null);
      setLoadError(null);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      if (await handleAccessError(error)) return;
      setLoadError(mapMobileUserError(error, "추천 보드를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [api, generationId, handleAccessError, isAuthLoaded, isSignedIn, resumeTarget]);

  const refreshStatus = useCallback(async () => {
    if (!isAuthLoaded || !isSignedIn || !resumeTarget || !generationId) return true;
    try {
      const status = await api.getGenerationStatus(generationId);
      setStatusSnapshot(status);
      setLastCheckedAt(new Date());
      const changed = Boolean(status.updatedAt && status.updatedAt !== lastUpdatedAtRef.current);
      setDetail((current) =>
        current
          ? {
              ...current,
              status: status.status,
              acceptedAt: status.acceptedAt ?? current.acceptedAt,
              preparationStatus: status.preparationStatus ?? current.preparationStatus,
              preparationError: status.preparationError ?? current.preparationError,
              creditReceipt:
                status.creditReceipt === undefined
                  ? current.creditReceipt
                  : status.creditReceipt == null
                    ? null
                    : normalizeGenerationCreditReceipt(status.creditReceipt),
              creditReceiptUnavailable: Boolean(status.creditReceiptUnavailable),
              retryPath: status.retryPath || current.retryPath || "/generate",
              originalRetention: status.originalRetention ?? current.originalRetention,
            }
          : current,
      );
      if (changed || status.terminal) {
        if (status.updatedAt) lastUpdatedAtRef.current = status.updatedAt;
        await load();
      }
      setIsRefreshingStatus(false);
      return status.terminal;
    } catch (error) {
      if (await handleAccessError(error)) return true;
      setLoadError(mapMobileUserError(error, "생성 상태를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
      setIsRefreshingStatus(false);
      return false;
    }
  }, [api, generationId, handleAccessError, isAuthLoaded, isSignedIn, load, resumeTarget]);

  const manuallyRefreshStatus = useCallback(async () => {
    setIsRefreshingStatus(true);
    await refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!isAuthLoaded || !isSignedIn || !resumeTarget) return;
    void load(true);
    return () => {
      requestIdRef.current += 1;
    };
  }, [isAuthLoaded, isSignedIn, load, recoveryToken, resumeTarget]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const nextIsActive = nextState === "active";
      setIsAppActive(nextIsActive);
      if (nextIsActive) {
        void refreshStatus();
      }
    });

    return () => subscription.remove();
  }, [refreshStatus]);

  const pollingGenerationStatus = detail?.status;

  useEffect(() => {
    if (
      !isAuthLoaded ||
      !isSignedIn ||
      accessIssue ||
      !isAppActive ||
      networkAvailability === "offline" ||
      !pollingGenerationStatus ||
      !isBackgroundGenerationPending(pollingGenerationStatus)
    ) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      const terminal = await refreshStatus();
      if (!cancelled && !terminal) {
        timer = setTimeout(poll, 3500);
      }
    };

    timer = setTimeout(poll, 3500);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [accessIssue, isAppActive, isAuthLoaded, isSignedIn, networkAvailability, pollingGenerationStatus, refreshStatus]);

  const activeSet = useMemo<RecommendationSet | null>(() => {
    const serverSet = detail?.recommendationSet ?? null;
    if (!serverSet) return draftSet;
    if (!draftSet) return serverSet;
    return {
      ...serverSet,
      variants: mergePromptTokens(serverSet.variants, draftSet.variants),
    };
  }, [detail?.recommendationSet, draftSet]);

  const variants = activeSet?.variants || [];
  const translate = useMobileResultTranslations([
    activeSet?.analysis.faceShape,
    activeSet?.analysis.summary,
    ...(activeSet?.analysis.volumeFocus || []),
    activeSet?.analysis.foreheadExposure,
    ...variants.flatMap((variant) => [variant.label, variant.reason, ...variant.tags]),
  ]);
  const completedCount = variants.filter((variant) => variant.status === "completed").length;
  const failedCount = variants.filter((variant) => variant.status === "failed").length;
  const readyCount = variants.filter(isRenderableVariant).length;
  const authoritativeCounts = statusSnapshot?.variants || {
    total: variants.length,
    completed: completedCount,
    failed: failedCount,
  };
  const selectedVariantId = activeSet?.selectedVariantId || null;
  const backgroundGenerationPending = !detail || isBackgroundGenerationPending(detail.status);
  const creditReceipt = detail?.creditReceipt ?? null;
  const creditReceiptPresentation = getGenerationCreditReceiptPresentation(
    creditReceipt?.state,
  );
  const freeRetryAvailable = Boolean(
    detail?.originalRetention?.retryAvailable && creditReceipt?.state !== "refunded",
  );
  const jobProgress = getGenerationJobProgressPresentation({
    status: statusSnapshot?.status ?? detail?.status ?? "queued",
    acceptedAt: statusSnapshot?.acceptedAt ?? detail?.acceptedAt,
    preparationStatus: statusSnapshot?.preparationStatus ?? detail?.preparationStatus,
    workflowDispatchStatus: statusSnapshot?.workflowDispatch?.status,
    totalVariantCount: authoritativeCounts.total,
    completedVariantCount: authoritativeCounts.completed,
    failedVariantCount: authoritativeCounts.failed,
  });
  const handleStartNewGeneration = async () => {
    const retryPath = detail?.retryPath || "/generate";
    if (retryPath === "/generate") {
      router.push("/generate" as Href);
      return;
    }

    try {
      await Linking.openURL(`${getHairfitApiBaseUrl()}${retryPath}`);
    } catch {
      setMessage("살롱 고객 생성 화면을 열지 못했습니다. 웹 HairFit에서 다시 시도해 주세요.");
    }
  };
  const statusMessage = detail?.selectionLocked
    ? selectionLockedMessage
    : isLoading && !detail
      ? "추천 보드와 생성 상태를 불러오는 중입니다."
      : jobProgress.descriptionKo;

  const switchToResultOwnerAccount = async () => {
    if (!resumeTarget) {
      router.replace("/");
      return;
    }

    authRedirectStartedRef.current = true;
    await pendingResumeStore.save(resumeTarget);
    try {
      await signOut();
      router.replace(buildAuthRoute("/login", resumeTarget) as Href);
    } catch {
      authRedirectStartedRef.current = false;
      setLoadError("계정 전환을 시작하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.");
    }
  };

  if (!isAuthLoaded) {
    return (
      <AppScreen>
        <Panel>
          <Stack>
            <Kicker>계정 확인</Kicker>
            <Heading>로그인 상태를 확인하고 있습니다</Heading>
            <BodyText>확인이 끝난 뒤 생성 결과를 안전하게 불러옵니다.</BodyText>
          </Stack>
        </Panel>
      </AppScreen>
    );
  }

  if (!resumeTarget) {
    return (
      <AppScreen>
        <Panel>
          <Stack>
            <Kicker>잘못된 링크</Kicker>
            <Heading>생성 결과 주소를 확인해 주세요</Heading>
            <BodyText>{loadError ?? "올바르지 않은 생성 링크입니다."}</BodyText>
            <Button onPress={() => router.replace("/")}>홈으로 이동</Button>
          </Stack>
        </Panel>
      </AppScreen>
    );
  }

  if (accessIssue === "forbidden") {
    return (
      <AppScreen>
        <Panel>
          <Stack>
            <Kicker>계정 확인 필요</Kicker>
            <Heading>이 계정의 생성 결과가 아닙니다</Heading>
            <BodyText>{loadError ?? "완료 안내 메일을 받은 계정으로 다시 로그인해 주세요."}</BodyText>
            <Button onPress={() => void switchToResultOwnerAccount()}>다른 계정으로 로그인</Button>
            <Button variant="secondary" onPress={() => router.replace("/")}>홈으로 이동</Button>
          </Stack>
        </Panel>
      </AppScreen>
    );
  }

  if (!isSignedIn || accessIssue === "unauthenticated") {
    return (
      <AppScreen>
        <Panel>
          <Stack>
            <Kicker>로그인 필요</Kicker>
            <Heading>로그인 후 이 결과로 돌아옵니다</Heading>
            <BodyText>로그인 화면으로 이동 중입니다. 이동하지 않으면 아래 버튼을 눌러 주세요.</BodyText>
            <Button onPress={() => router.replace(buildAuthRoute("/login", resumeTarget) as Href)}>
              로그인 화면으로 이동
            </Button>
          </Stack>
        </Panel>
      </AppScreen>
    );
  }

  const runVariant = async (variant: GeneratedVariant, index: number) => {
    if (detail?.selectionLocked) {
      setMessage(selectionLockedMessage);
      return;
    }

    if (backgroundGenerationPending) {
      setMessage("백그라운드 생성이 끝난 뒤 실패한 카드만 다시 시도할 수 있습니다.");
      return;
    }

    if (creditReceipt?.state === "refunded") {
      setMessage("전체 실패로 크레딧이 복구되었습니다. 새 사진 접수로 다시 생성해 주세요.");
      return;
    }
    if (!freeRetryAvailable) {
      setMessage("원본 사진의 보관기한이 끝났거나 삭제가 시작되어 무료 재시도를 이용할 수 없습니다.");
      return;
    }
    if (pendingVariantId) return;

    setPendingVariantId(variant.id);
    setMessage("새 헤어스타일 미리보기를 생성하고 있습니다.");
    try {
      await api.retryGenerationVariant({
        generationId,
        variantIndex: index,
        variantId: variant.id,
        catalogItemId: variant.catalogItemId ?? null,
      });
      await load();
      setMessage("새 헤어스타일이 완성되었습니다. 상세 결과를 열거나 추천 보드에서 계속 비교해 주세요.");
    } catch (error) {
      if (await handleAccessError(error)) return;
      setMessage(mapMobileUserError(error, "다른 헤어스타일을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요."));
      await load();
    } finally {
      setPendingVariantId(null);
    }
  };

  const abandonRetry = () => {
    if (!generationId || isAbandoningRetry) return;
    Alert.alert(
      freeRetryAvailable ? "무료 재시도를 포기할까요?" : "원본 사진을 지금 삭제할까요?",
      freeRetryAvailable
        ? "원본 사진 삭제를 즉시 요청합니다. 이후에는 이 작업의 실패한 후보를 다시 생성할 수 없으며 되돌릴 수 없습니다."
        : "전체 실패 크레딧은 이미 복구되었습니다. 원본 사진을 지금 삭제하면 자동 삭제 시각까지 기다리지 않습니다.",
      [
        { text: "취소", style: "cancel" },
        {
          text: freeRetryAvailable ? "포기하고 삭제" : "지금 삭제",
          style: "destructive",
          onPress: () => {
            setIsAbandoningRetry(true);
            setMessage("원본 사진 삭제를 요청하고 있습니다.");
            void api.abandonGenerationRetry(generationId)
              .then((result) => {
                setDetail((current) => current
                  ? { ...current, originalRetention: result.originalRetention }
                  : current);
                setMessage(
                  result.originalRetention.status === "deleted"
                    ? "원본 사진이 삭제되었습니다. 무료 재시도가 종료되었습니다."
                    : "원본 삭제 요청이 접수되었습니다. 무료 재시도가 종료되었습니다.",
                );
              })
              .catch(async (error) => {
                if (await handleAccessError(error)) return;
                setMessage(mapMobileUserError(error, "무료 재시도 포기를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."));
              })
              .finally(() => setIsAbandoningRetry(false));
          },
        },
      ],
    );
  };

  const openResult = async (variant: GeneratedVariant) => {
    if (!generationId || openingVariantId) return;
    const lockedSelectedVariantId = activeSet?.selectedVariantId || detail?.selectedVariant?.id || "";
    if (detail?.selectionLocked && variant.id !== lockedSelectedVariantId) {
      setMessage(selectionLockedMessage);
      return;
    }

    setOpeningVariantId(variant.id);
    try {
      await api.patchSelectedVariant(generationId, variant.id);
    } catch (error) {
      if (error instanceof HairfitApiError && error.status === 409) {
        setMessage(selectionLockedMessage);
        return;
      }
      if (await handleAccessError(error)) return;
      setMessage(mapMobileUserError(error, "선택한 헤어를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."));
      return;
    } finally {
      setOpeningVariantId(null);
    }
    router.push(`/result/${generationId}?variant=${encodeURIComponent(variant.id)}`);
  };

  return (
    <AppScreen>
      <Stack>
        <Kicker>헤어 추천 보드</Kicker>
        <Heading>나에게 맞춘 헤어스타일 결과</Heading>
        <BodyText>{statusMessage}</BodyText>
        {message ? (
          <View accessibilityLiveRegion="polite">
            <BodyText>{message}</BodyText>
          </View>
        ) : null}
        <Button
          disabled={isVariantActionPending}
          variant="secondary"
          onPress={navigateBack}
        >
          마이페이지로 돌아가기
        </Button>
      </Stack>

      <Panel>
        <Stack>
          {loadError ? (
            <View accessibilityLiveRegion="assertive" accessibilityRole="alert">
              <Card>
                <Stack gap={10}>
                  <Kicker>불러오기 오류</Kicker>
                  <BodyText style={styles.errorText}>{loadError}</BodyText>
                  <Button disabled={isLoading} onPress={() => void load(true)}>
                    {isLoading ? "다시 불러오는 중..." : "다시 불러오기"}
                  </Button>
                </Stack>
              </Card>
            </View>
          ) : null}

          <GenerationJobProgressCard
            presentation={jobProgress}
            lastCheckedAt={lastCheckedAt}
            refreshing={isRefreshingStatus}
            onRefresh={() => void manuallyRefreshStatus()}
          />

          {failedCount > 0 && !backgroundGenerationPending && detail?.originalRetention ? (
            <Card>
              <Stack gap={10}>
                <Kicker>원본 사진과 무료 재시도</Kicker>
                <Heading>
                  {freeRetryAvailable
                    ? `${formatRetentionDeadline(detail.originalRetention.expiresAt)}까지 무료 재시도 가능`
                    : creditReceipt?.state === "refunded" && detail.originalRetention.status === "retained"
                      ? `${formatRetentionDeadline(detail.originalRetention.expiresAt)} 이내 자동 삭제`
                    : detail.originalRetention.status === "deleted"
                      ? "원본 삭제 완료"
                      : detail.originalRetention.status === "cleanup_queued"
                        ? "원본 삭제 처리 중"
                        : "무료 재시도 기한 만료"}
                </Heading>
                <BodyText>
                  {freeRetryAvailable
                    ? "실패한 후보만 무료로 다시 시도할 수 있도록 원본을 비공개로 보관합니다."
                    : creditReceipt?.state === "refunded" && detail.originalRetention.status === "retained"
                      ? "전체 실패 크레딧이 복구되어 이 작업은 재시도하지 않습니다. 원본은 자동 삭제를 기다리거나 지금 삭제할 수 있습니다."
                    : "원본을 더 이상 새 생성에 사용하지 않습니다. 필요한 경우 새 사진으로 다시 접수해 주세요."}
                </BodyText>
                {detail.originalRetention.status === "retained" && (freeRetryAvailable || creditReceipt?.state === "refunded") ? (
                  <Button disabled={isAbandoningRetry} variant="secondary" onPress={abandonRetry}>
                    {isAbandoningRetry
                      ? "삭제 요청 중..."
                      : freeRetryAvailable
                        ? "무료 재시도 포기하고 원본 삭제"
                        : "원본 사진 지금 삭제"}
                  </Button>
                ) : null}
              </Stack>
            </Card>
          ) : null}

            <Row>
              <Stat label="확인 가능" value={readyCount} />
              <Stat label="완료" value={completedCount} />
              <Stat label="실패" value={failedCount} />
          </Row>

          {creditReceipt ? (
            <Card>
              <Stack gap={8}>
                <Kicker>크레딧 영수증</Kicker>
                <Heading>
                      {creditReceipt.state === "reserved"
                        ? `${creditReceipt.reservedCredits}크레딧 사용 예정`
                    : creditReceipt.state === "charged"
                      ? `${creditReceipt.chargedCredits}크레딧 차감 완료`
                      : `${creditReceipt.refundedCredits}크레딧 복구 완료`}
                </Heading>
                <BodyText>{creditReceiptPresentation.descriptionKo}</BodyText>
                <BodyText>
                      {creditReceipt.state === "refunded"
                        ? `복구 직후 잔액 ${creditReceipt.balanceAfterRefund ?? "-"}크레딧`
                        : `작업 접수 직후 잔액 ${creditReceipt.balanceAfterReservation}크레딧`}
                </BodyText>
              </Stack>
            </Card>
          ) : detail?.creditReceiptUnavailable ? (
            <Card>
              <BodyText>크레딧 처리 상태를 일시적으로 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.</BodyText>
            </Card>
          ) : null}

          {creditReceipt?.state === "refunded" ? (
            <Button onPress={() => void handleStartNewGeneration()}>
              새 사진으로 다시 생성
            </Button>
          ) : null}

            {activeSet?.analysis?.summary ? (
              <Card>
                <Stack gap={10}>
                  <Kicker>얼굴 분석 요약</Kicker>
                  <Heading>{translate(activeSet.analysis.faceShape, "얼굴형 분석")}</Heading>
                <BodyText>{translate(activeSet.analysis.summary, "얼굴형과 전체 균형을 분석했습니다.")}</BodyText>
                <Cluster>
                  {(activeSet.analysis.volumeFocus || []).map((item, index) => (
                    <Chip key={item} tone="accent">{translate(item, `볼륨 포인트 ${index + 1}`)}</Chip>
                  ))}
                  {activeSet.analysis.foreheadExposure ? (
                    <Chip>{translate(activeSet.analysis.foreheadExposure, "이마 노출 균형")}</Chip>
                  ) : null}
                </Cluster>
              </Stack>
            </Card>
          ) : null}
        </Stack>
      </Panel>

      <Stack>
        {variants.map((variant, index) => {
          const imageUrl = variant.outputUrl || null;
          const score = evaluationScore(variant);
          const selected = selectedVariantId === variant.id;
          const displayLabel = translate(variant.label, `추천 스타일 ${variant.rank || index + 1}`);
          const displayReason = translate(
            variant.reason,
            "얼굴형과 전체 균형을 고려한 추천 스타일입니다.",
          );
          const resultImageLabel =
            `${displayLabel} 헤어스타일 결과 이미지${selected ? ", 현재 선택됨" : ""}`;
          const canOpen = Boolean(imageUrl);

          return (
            <Card key={variant.id || index} style={selected ? styles.selectedCard : undefined}>
              <Stack>
                <View style={styles.preview}>
                  {imageUrl ? (
                    <Image
                      accessible
                      accessibilityLabel={resultImageLabel}
                      accessibilityRole="image"
                      resizeMode="contain"
                      source={{ uri: imageUrl }}
                      style={styles.image}
                    />
                      ) : (
                        <BodyText>
                          {variant.status === "failed"
                            ? "이 헤어스타일 생성에 실패했습니다. 아래에서 다시 시도해 주세요."
                            : variant.status === "generating"
                              ? "헤어스타일 미리보기를 생성하고 있습니다."
                              : "생성 순서를 기다리고 있습니다."}
                        </BodyText>
                      )}
                </View>

                    <Cluster>
                      <Chip>#{variant.rank || index + 1} {formatCorrectionFocus(variant.correctionFocus)}</Chip>
                      <Chip>{formatLengthBucket(variant.lengthBucket)}</Chip>
                      <Chip tone={statusTone(variant.status)}>{variantStatusLabel(variant.status)}</Chip>
                      {score === null ? <Chip>평가 대기</Chip> : <Chip tone="success">평가 {score}점</Chip>}
                      {selected ? <Chip tone="success">선택됨</Chip> : null}
                    </Cluster>

                    <Stack gap={10}>
                      <Heading>{displayLabel}</Heading>
                      <BodyText>{displayReason}</BodyText>
                </Stack>

                <Cluster>
                  {(variant.tags || []).slice(0, 6).map((tag, tagIndex) => (
                    <Chip key={tag}>{translate(tag, `스타일 특징 ${tagIndex + 1}`)}</Chip>
                  ))}
                </Cluster>

                    {variant.status === "failed" ? (
                      <BodyText style={styles.errorText}>
                        이 후보를 완성하지 못했습니다. 다른 결과는 그대로 두고 이 후보만 다시 시도할 수 있습니다.
                      </BodyText>
                    ) : null}
                <Divider />

                <Button
                  accessibilityState={{ selected }}
                  disabled={!canOpen || Boolean(openingVariantId)}
                  onPress={() => openResult(variant)}
                    >
                      {openingVariantId === variant.id ? "결과 여는 중..." : "결과 열기"}
                </Button>
                {variant.status === "failed" ? (
                  <Button
                    disabled={
                      backgroundGenerationPending ||
                      creditReceipt?.state === "refunded" ||
                      !freeRetryAvailable ||
                      pendingVariantId === variant.id
                    }
                    variant="secondary"
                    onPress={() => runVariant(variant, index)}
                  >
                    {backgroundGenerationPending
                      ? "백그라운드 생성 중"
                      : creditReceipt?.state === "refunded"
                        ? "새 생성 필요"
                        : !freeRetryAvailable
                          ? "재시도 종료"
                          : pendingVariantId === variant.id
                            ? "다시 시도하는 중..."
                            : "실패한 후보 다시 시도"}
                  </Button>
                ) : null}
              </Stack>
            </Card>
          );
        })}
      </Stack>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  preview: {
    alignItems: "center",
    aspectRatio: 3 / 5,
    backgroundColor: "#eee8de",
    borderRadius: 8,
    justifyContent: "center",
    overflow: "hidden",
    width: "100%",
  },
  image: {
    height: "100%",
    width: "100%",
  },
  selectedCard: {
    borderColor: "#181411",
    borderWidth: 2,
  },
  errorText: {
    color: "#b42318",
  },
});
