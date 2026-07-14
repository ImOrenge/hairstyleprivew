import type { GeneratedVariant, RecommendationSet } from "@hairfit/shared";
import { HairfitApiError, type GenerationStatus } from "@hairfit/api-client";
import { BodyText, Button, Card, Chip, Cluster, Divider, Heading, Kicker, Panel, Row, Screen, Stack, Stat } from "@hairfit/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Image, StyleSheet, View } from "react-native";
import { useHairfitApi } from "../../lib/api";
import { useGenerationFlow } from "../../lib/generation-flow";

interface GenerationDetail {
  id: string;
  status: GenerationStatus;
  updatedAt?: string | null;
  recommendationSet: RecommendationSet | null;
  selectedVariant: GeneratedVariant | null;
  selectionLocked: boolean;
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
  const api = useHairfitApi();
  const flow = useGenerationFlow();
  const { id } = useLocalSearchParams<{ id: string }>();
  const generationId = typeof id === "string" ? id : "";
  const [detail, setDetail] = useState<GenerationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === "active");
  const [pendingVariantId, setPendingVariantId] = useState<string | null>(null);
  const [openingVariantId, setOpeningVariantId] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const lastUpdatedAtRef = useRef("");

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

  const load = useCallback(async (showLoading = false) => {
    if (!generationId) {
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
      setDetail((current) => ({
        id: result.id,
        status: result.status,
        updatedAt: result.updatedAt,
        recommendationSet: preserveSignedVariantUrls(
          current?.recommendationSet,
          result.recommendationSet,
        ),
        selectedVariant: result.selectedVariant,
        selectionLocked: Boolean(result.selectionLocked),
      }));
      if (result.updatedAt) lastUpdatedAtRef.current = result.updatedAt;
      setLoadError(null);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setLoadError(error instanceof Error ? error.message : "추천 보드를 불러오지 못했습니다.");
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [api, generationId]);

  const refreshStatus = useCallback(async () => {
    if (!generationId) return true;
    try {
      const status = await api.getGenerationStatus(generationId);
      const changed = Boolean(status.updatedAt && status.updatedAt !== lastUpdatedAtRef.current);
      setDetail((current) =>
        current && current.status !== status.status ? { ...current, status: status.status } : current,
      );
      if (changed || status.terminal) {
        if (status.updatedAt) lastUpdatedAtRef.current = status.updatedAt;
        await load();
      }
      return status.terminal;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "생성 상태를 불러오지 못했습니다.");
      return false;
    }
  }, [api, generationId, load]);

  useEffect(() => {
    void load(true);
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

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

  useEffect(() => {
    if (!isAppActive || !detail || !isBackgroundGenerationPending(detail.status)) return;
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
  }, [detail?.status, isAppActive, refreshStatus]);

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
  const completedCount = variants.filter((variant) => variant.status === "completed").length;
  const failedCount = variants.filter((variant) => variant.status === "failed").length;
  const readyCount = variants.filter(isRenderableVariant).length;
  const selectedVariantId = activeSet?.selectedVariantId || null;
  const backgroundGenerationPending = !detail || isBackgroundGenerationPending(detail.status);
  const statusMessage = detail?.selectionLocked
    ? selectionLockedMessage
    : isLoading && !detail
      ? "추천 보드와 생성 상태를 불러오는 중입니다."
      : isBackgroundGenerationPending(detail?.status)
        ? "백그라운드에서 헤어스타일을 생성하고 있습니다. 다른 화면으로 이동하거나 앱을 닫아도 계속 진행되며, 완료 시 가입 이메일로 알려드립니다."
        : detail?.status === "completed"
          ? "헤어스타일 생성이 완료되었습니다. 준비된 카드를 열어 비교해 보세요. 완료 안내 이메일도 순차 발송됩니다."
          : detail?.status === "failed"
            ? "헤어스타일 생성에 실패했습니다. 아래 실패한 카드는 이 앱 세션에 원본 사진이 남아 있을 때 다시 시도할 수 있습니다."
            : "추천 보드의 최신 상태를 확인해 주세요.";

  const runVariant = async (variant: GeneratedVariant, index: number) => {
    if (detail?.selectionLocked) {
      setMessage(selectionLockedMessage);
      return;
    }

    if (backgroundGenerationPending) {
      setMessage("백그라운드 생성이 끝난 뒤 실패한 카드만 다시 시도할 수 있습니다.");
      return;
    }

    if (!flow.draft?.imageDataUrl || pendingVariantId) {
      setMessage("Retry requires the portrait selected in this mobile session.");
      return;
    }
    if (!variant.promptArtifactToken) {
      setMessage("This recommendation is missing its prompt token.");
      return;
    }

    setPendingVariantId(variant.id);
    setMessage("Rendering AI preview...");
    try {
      await api.runGeneration({
        generationId,
        prompt: variant.prompt,
        promptArtifactToken: variant.promptArtifactToken,
        imageDataUrl: flow.draft.imageDataUrl,
        variantIndex: index,
        variantId: variant.id,
        catalogItemId: variant.catalogItemId ?? null,
      });
      await load();
      setMessage("Variant rendered. Open it as a detailed result or continue comparing the board.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Variant generation failed.");
      await load();
    } finally {
      setPendingVariantId(null);
    }
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
      setMessage(error instanceof Error ? error.message : "선택한 헤어를 저장하지 못했습니다.");
      return;
    } finally {
      setOpeningVariantId(null);
    }
    router.push(`/result/${generationId}?variant=${encodeURIComponent(variant.id)}`);
  };

  return (
    <Screen>
      <Stack>
        <Kicker>Recommendation Board</Kicker>
        <Heading>Nine tailored hairstyle directions</Heading>
        <BodyText>{statusMessage}</BodyText>
        {message ? <BodyText>{message}</BodyText> : null}
      </Stack>

      <Panel>
        <Stack>
          {loadError ? (
            <Card>
              <Stack gap={10}>
                <Kicker>불러오기 오류</Kicker>
                <BodyText style={styles.errorText}>{loadError}</BodyText>
                <Button disabled={isLoading} onPress={() => void load(true)}>
                  {isLoading ? "다시 불러오는 중..." : "다시 불러오기"}
                </Button>
              </Stack>
            </Card>
          ) : null}

          <Row>
            <Stat label="Ready" value={readyCount} />
            <Stat label="Completed" value={completedCount} />
            <Stat label="Failed" value={failedCount} />
          </Row>

          {activeSet?.analysis?.summary ? (
            <Card>
              <Stack gap={10}>
                <Kicker>Analysis Summary</Kicker>
                <Heading>{activeSet.analysis.faceShape || "Face analysis"}</Heading>
                <BodyText>{activeSet.analysis.summary}</BodyText>
                <Cluster>
                  {(activeSet.analysis.volumeFocus || []).map((item) => (
                    <Chip key={item} tone="accent">{item}</Chip>
                  ))}
                  {activeSet.analysis.foreheadExposure ? <Chip>{activeSet.analysis.foreheadExposure}</Chip> : null}
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
          const canRender = Boolean(flow.draft?.imageDataUrl && variant.promptArtifactToken);
          const canOpen = Boolean(imageUrl);

          return (
            <Card key={variant.id || index} style={selected ? styles.selectedCard : undefined}>
              <Stack>
                <View style={styles.preview}>
                  {imageUrl ? (
                    <Image resizeMode="contain" source={{ uri: imageUrl }} style={styles.image} />
                  ) : (
                    <BodyText>
                      {variant.status === "failed"
                        ? "Variant failed. Retry to render this hairstyle."
                        : variant.status === "generating"
                          ? "Rendering AI preview..."
                          : "Waiting in queue..."}
                    </BodyText>
                  )}
                </View>

                <Cluster>
                  <Chip>#{variant.rank || index + 1} {variant.correctionFocus}</Chip>
                  <Chip tone={statusTone(variant.status)}>{variant.status}</Chip>
                  {score === null ? <Chip>Pending score</Chip> : <Chip tone="success">Score {score}</Chip>}
                  {selected ? <Chip tone="success">Selected</Chip> : null}
                </Cluster>

                <Stack gap={10}>
                  <Heading>{variant.label || `Recommendation ${index + 1}`}</Heading>
                  <BodyText>{variant.reason}</BodyText>
                </Stack>

                <Cluster>
                  {(variant.tags || []).slice(0, 6).map((tag) => (
                    <Chip key={tag}>{tag}</Chip>
                  ))}
                </Cluster>

                {variant.error ? <BodyText style={styles.errorText}>{variant.error}</BodyText> : null}
                <Divider />

                <Button disabled={!canOpen || Boolean(openingVariantId)} onPress={() => openResult(variant)}>
                  {openingVariantId === variant.id ? "Opening..." : "Open Result"}
                </Button>
                <Button
                  disabled={
                    !canRender ||
                    backgroundGenerationPending ||
                    pendingVariantId === variant.id ||
                    variant.status === "generating"
                  }
                  variant="secondary"
                  onPress={() => runVariant(variant, index)}
                >
                  {backgroundGenerationPending
                    ? "백그라운드 생성 중"
                    : pendingVariantId === variant.id
                      ? "Retrying..."
                      : variant.status === "completed"
                        ? "Render again"
                        : "Retry"}
                </Button>
              </Stack>
            </Card>
          );
        })}
      </Stack>
    </Screen>
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
