import type { GeneratedVariant, RecommendationSet } from "@hairfit/shared";
import { BodyText, Button, Card, Heading, Kicker, Panel, Screen, Stack } from "@hairfit/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useHairfitApi } from "../../lib/api";

interface GenerationDetail {
  id: string;
  status: string;
  recommendationSet: RecommendationSet | null;
  selectedVariant: GeneratedVariant | null;
}

function firstRenderableVariant(set: RecommendationSet | null) {
  return set?.variants.find((variant) => variant.outputUrl || variant.generatedImagePath) || null;
}

export default function ResultDetailScreen() {
  const router = useRouter();
  const api = useHairfitApi();
  const { id } = useLocalSearchParams<{ id: string }>();
  const generationId = typeof id === "string" ? id : "";
  const [detail, setDetail] = useState<GenerationDetail | null>(null);
  const [message, setMessage] = useState<string | null>("Loading result...");
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!generationId) return;
      setMessage("Loading result...");
      try {
        const result = await api.getGeneration(generationId);
        if (!cancelled) {
          setDetail({
            id: result.id,
            status: result.status,
            recommendationSet: result.recommendationSet,
            selectedVariant: result.selectedVariant as GeneratedVariant | null,
          });
          setMessage("Result loaded.");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Failed to load result.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, generationId]);

  const selectVariant = async (variant: GeneratedVariant) => {
    if (!generationId || pendingSelection) return;
    setPendingSelection(variant.id);
    setMessage(null);
    try {
      await api.patchSelectedVariant(generationId, variant.id);
      setDetail((current) => {
        if (!current?.recommendationSet) return current;
        return {
          ...current,
          recommendationSet: {
            ...current.recommendationSet,
            selectedVariantId: variant.id,
          },
          selectedVariant: variant,
        };
      });
      setMessage("Selected style saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save selection.");
    } finally {
      setPendingSelection(null);
    }
  };

  const primary = detail?.selectedVariant || firstRenderableVariant(detail?.recommendationSet ?? null);
  const imageUrl = primary?.outputUrl || null;

  return (
    <Screen>
      <Stack>
        <Kicker>Result</Kicker>
        <Heading>{primary?.label || "HairFit result"}</Heading>
        <BodyText>Generation ID: {generationId || "unknown"}</BodyText>
      </Stack>

      <Panel>
        <Stack>
          <View style={styles.preview}>
            {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.image} /> : <BodyText>No rendered image yet</BodyText>}
          </View>

          {primary ? (
            <Card>
              <Stack gap={10}>
                <Kicker>Designer brief</Kicker>
                <BodyText>{primary.reason}</BodyText>
              </Stack>
            </Card>
          ) : null}

          {detail?.recommendationSet ? (
            <Stack>
              <Kicker>Variants</Kicker>
              {detail.recommendationSet.variants.map((variant) => (
                <Card key={variant.id}>
                  <Stack gap={10}>
                    <Heading>{variant.label}</Heading>
                    <BodyText>Status: {variant.status}</BodyText>
                    <Button
                      disabled={!variant.outputUrl || pendingSelection === variant.id}
                      onPress={() => selectVariant(variant)}
                    >
                      {detail.recommendationSet?.selectedVariantId === variant.id
                        ? "Selected"
                        : pendingSelection === variant.id
                          ? "Saving..."
                          : "Select result"}
                    </Button>
                  </Stack>
                </Card>
              ))}
            </Stack>
          ) : null}

          {message ? <BodyText>{message}</BodyText> : null}
          <Button onPress={() => router.push("/styler/new")}>Continue to fashion styler</Button>
          <Button variant="secondary" onPress={() => router.push("/mypage")}>Open my page</Button>
        </Stack>
      </Panel>
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
});
