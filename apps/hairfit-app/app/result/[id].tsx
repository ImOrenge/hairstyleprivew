import type { GeneratedVariant, RecommendationSet, ServiceType } from "@hairfit/shared";
import { BodyText, Button, Card, Chip, Cluster, Heading, Kicker, Panel, Screen, Stack, TextField } from "@hairfit/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
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

const serviceOptions: Array<{ value: ServiceType; label: string }> = [
  { value: "cut", label: "Cut" },
  { value: "perm", label: "Perm" },
  { value: "color", label: "Color" },
  { value: "bleach", label: "Bleach" },
  { value: "treatment", label: "Treatment" },
  { value: "other", label: "Other" },
];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export default function ResultDetailScreen() {
  const router = useRouter();
  const api = useHairfitApi();
  const { id, variant } = useLocalSearchParams<{ id: string; variant?: string }>();
  const generationId = typeof id === "string" ? id : "";
  const variantFromRoute = typeof variant === "string" ? variant : "";
  const [detail, setDetail] = useState<GenerationDetail | null>(null);
  const [message, setMessage] = useState<string | null>("Loading result...");
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);
  const [serviceType, setServiceType] = useState<ServiceType>("cut");
  const [serviceDate, setServiceDate] = useState(todayKey());
  const [aftercarePending, setAftercarePending] = useState(false);

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

  const primary = useMemo(() => {
    const variants = detail?.recommendationSet?.variants || [];
    const routeSelected = variantFromRoute
      ? variants.find((item) => item.id === variantFromRoute) || null
      : null;
    return routeSelected || detail?.selectedVariant || firstRenderableVariant(detail?.recommendationSet ?? null);
  }, [detail, variantFromRoute]);
  const imageUrl = primary?.outputUrl || null;

  const createAftercare = async () => {
    if (!generationId || !primary?.id || aftercarePending) return;
    setAftercarePending(true);
    setMessage(null);
    try {
      const result = await api.createHairRecord({
        generationId,
        selectedVariantId: primary.id,
        serviceType,
        serviceDate,
      });
      setMessage(`Aftercare guide created for ${result.styleName}.`);
      router.push(`/aftercare/${result.hairRecordId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create aftercare guide.");
    } finally {
      setAftercarePending(false);
    }
  };

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
            {imageUrl ? <Image resizeMode="contain" source={{ uri: imageUrl }} style={styles.image} /> : <BodyText>No rendered image yet</BodyText>}
          </View>

          {primary ? (
            <Card>
              <Stack gap={10}>
                <Kicker>Designer brief</Kicker>
                <BodyText>{primary.reason}</BodyText>
                <Cluster>
                  {(primary.tags || []).slice(0, 6).map((tag) => (
                    <Chip key={tag}>{tag}</Chip>
                  ))}
                </Cluster>
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

          <Panel>
            <Stack>
              <Kicker>Aftercare</Kicker>
              <Heading>Confirm this style as a salon record</Heading>
              <BodyText>Create the same aftercare guide used by the web result flow after a selected hairstyle is confirmed.</BodyText>
              <Cluster>
                {serviceOptions.map((option) => (
                  <Button
                    key={option.value}
                    variant={serviceType === option.value ? "primary" : "secondary"}
                    onPress={() => setServiceType(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </Cluster>
              <TextField label="Service date" onChangeText={setServiceDate} placeholder="YYYY-MM-DD" value={serviceDate} />
              <Button disabled={!primary?.id || aftercarePending} onPress={createAftercare}>
                {aftercarePending ? "Creating aftercare..." : "Create aftercare guide"}
              </Button>
            </Stack>
          </Panel>

          {message ? <BodyText>{message}</BodyText> : null}
          <Button
            disabled={!primary?.id}
            onPress={() =>
              router.push(`/styler/new?generationId=${encodeURIComponent(generationId)}&variant=${encodeURIComponent(primary?.id || "")}`)
            }
          >
            Continue to fashion styler
          </Button>
          <Button variant="secondary" onPress={() => router.push(`/generate/${generationId}`)}>Open 3x3 board</Button>
          <Button variant="secondary" onPress={() => router.push("/mypage")}>Open my page</Button>
        </Stack>
      </Panel>
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
});
