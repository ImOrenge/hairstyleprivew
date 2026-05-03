import type { GeneratedVariant, RecommendationSet } from "@hairfit/shared";
import { BodyText, Button, Card, Chip, Cluster, Divider, Heading, Kicker, Panel, Row, Screen, Stack, Stat } from "@hairfit/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useHairfitApi } from "../../lib/api";
import { useGenerationFlow } from "../../lib/generation-flow";

interface GenerationDetail {
  id: string;
  status: string;
  recommendationSet: RecommendationSet | null;
  selectedVariant: GeneratedVariant | null;
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

export default function GenerateBoardScreen() {
  const router = useRouter();
  const api = useHairfitApi();
  const flow = useGenerationFlow();
  const { id } = useLocalSearchParams<{ id: string }>();
  const generationId = typeof id === "string" ? id : "";
  const [detail, setDetail] = useState<GenerationDetail | null>(null);
  const [message, setMessage] = useState("Loading recommendation board...");
  const [pendingVariantId, setPendingVariantId] = useState<string | null>(null);
  const [openingVariantId, setOpeningVariantId] = useState<string | null>(null);

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

  const load = async () => {
    if (!generationId) return;
    setMessage("Loading recommendation board...");
    try {
      const result = await api.getGeneration(generationId);
      setDetail({
        id: result.id,
        status: result.status,
        recommendationSet: result.recommendationSet,
        selectedVariant: result.selectedVariant as GeneratedVariant | null,
      });
      setMessage("Review the full 3x3 board, retry failed renders, and open any finished card as a detailed result.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load recommendation board.");
    }
  };

  useEffect(() => {
    void load();
  }, [generationId]);

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

  const runVariant = async (variant: GeneratedVariant, index: number) => {
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
    setOpeningVariantId(variant.id);
    try {
      await api.patchSelectedVariant(generationId, variant.id);
    } catch {
      // Result can still open; the result screen exposes the save error if selection fails again.
    } finally {
      setOpeningVariantId(null);
      router.push(`/result/${generationId}?variant=${encodeURIComponent(variant.id)}`);
    }
  };

  return (
    <Screen>
      <Stack>
        <Kicker>Recommendation Board</Kicker>
        <Heading>Nine tailored hairstyle directions</Heading>
        <BodyText>{message}</BodyText>
      </Stack>

      <Panel>
        <Stack>
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
                    <Image source={{ uri: imageUrl }} style={styles.image} />
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
                  disabled={!canRender || pendingVariantId === variant.id || variant.status === "generating"}
                  variant="secondary"
                  onPress={() => runVariant(variant, index)}
                >
                  {pendingVariantId === variant.id ? "Retrying..." : variant.status === "completed" ? "Render again" : "Retry"}
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
    aspectRatio: 4 / 5,
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
