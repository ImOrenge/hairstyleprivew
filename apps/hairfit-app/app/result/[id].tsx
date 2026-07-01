import type { GeneratedVariant, RecommendationSet, ServiceType } from "@hairfit/shared";
import { HairfitApiError } from "@hairfit/api-client";
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
  selectionLocked: boolean;
  confirmedHairRecord: {
    id: string;
    styleName: string;
    serviceType: string;
    serviceDate: string;
    createdAt: string;
  } | null;
}

function firstRenderableVariant(set: RecommendationSet | null) {
  return set?.variants.find((variant) => variant.outputUrl || variant.generatedImagePath) || null;
}

const serviceOptions: Array<{ value: ServiceType; label: string }> = [
  { value: "cut", label: "커트" },
  { value: "perm", label: "펌" },
  { value: "color", label: "염색" },
  { value: "bleach", label: "탈색" },
  { value: "treatment", label: "트리트먼트" },
  { value: "other", label: "기타" },
];

const selectionLockedMessage = "확정한 헤어는 변경할 수 없습니다. 다른 스타일은 새로 생성해 주세요.";

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
  const [message, setMessage] = useState<string | null>("결과를 불러오는 중입니다.");
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);
  const [serviceType, setServiceType] = useState<ServiceType>("cut");
  const [serviceDate, setServiceDate] = useState(todayKey());
  const [aftercarePending, setAftercarePending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!generationId) return;
      setMessage("결과를 불러오는 중입니다.");
      try {
        const result = await api.getGeneration(generationId);
        if (!cancelled) {
          setDetail({
            id: result.id,
            status: result.status,
            recommendationSet: result.recommendationSet,
            selectedVariant: result.selectedVariant as GeneratedVariant | null,
            selectionLocked: Boolean(result.selectionLocked),
            confirmedHairRecord: result.confirmedHairRecord ?? null,
          });
          const serverSelectedVariantId =
            (result.selectedVariant as GeneratedVariant | null)?.id ||
            result.recommendationSet?.selectedVariantId ||
            "";
          setMessage(
            result.selectionLocked && variantFromRoute && variantFromRoute !== serverSelectedVariantId
              ? selectionLockedMessage
              : "결과를 불러왔습니다.",
          );
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "결과를 불러오지 못했습니다.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, generationId, variantFromRoute]);

  const selectVariant = async (variant: GeneratedVariant) => {
    if (!generationId || pendingSelection) return;
    const lockedSelectedVariantId = detail?.recommendationSet?.selectedVariantId || detail?.selectedVariant?.id || "";
    if (detail?.selectionLocked && variant.id !== lockedSelectedVariantId) {
      setMessage(selectionLockedMessage);
      return;
    }

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
      setMessage("선택한 스타일을 저장했습니다.");
    } catch (error) {
      setMessage(
        error instanceof HairfitApiError && error.status === 409
          ? selectionLockedMessage
          : error instanceof Error
            ? error.message
            : "선택한 스타일을 저장하지 못했습니다.",
      );
    } finally {
      setPendingSelection(null);
    }
  };

  const primary = useMemo(() => {
    const variants = detail?.recommendationSet?.variants || [];
    const routeSelected = !detail?.selectionLocked && variantFromRoute
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
      setMessage(`${result.styleName} 에프터케어 가이드를 만들었습니다.`);
      router.push(`/aftercare/${result.hairRecordId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "에프터케어 가이드를 만들지 못했습니다.");
    } finally {
      setAftercarePending(false);
    }
  };

  return (
    <Screen>
      <Stack>
        <Kicker>결과</Kicker>
        <Heading>{primary?.label || "HairFit 결과"}</Heading>
        <BodyText>생성 ID: {generationId || "알 수 없음"}</BodyText>
      </Stack>

      <Panel>
        <Stack>
          <View style={styles.preview}>
            {imageUrl ? <Image resizeMode="contain" source={{ uri: imageUrl }} style={styles.image} /> : <BodyText>아직 렌더링된 이미지가 없습니다.</BodyText>}
          </View>

          {primary ? (
            <Card>
              <Stack gap={10}>
                <Kicker>디자이너 브리프</Kicker>
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
              <Kicker>후보 스타일</Kicker>
              {detail.recommendationSet.variants.map((variant) => (
                <Card key={variant.id}>
                  <Stack gap={10}>
                    <Heading>{variant.label}</Heading>
                    <BodyText>상태: {variant.status}</BodyText>
                    <Button
                      disabled={!variant.outputUrl || pendingSelection === variant.id}
                      onPress={() => selectVariant(variant)}
                    >
                      {detail.recommendationSet?.selectedVariantId === variant.id
                        ? "선택됨"
                        : pendingSelection === variant.id
                          ? "저장 중..."
                          : "이 결과 선택"}
                    </Button>
                  </Stack>
                </Card>
              ))}
            </Stack>
          ) : null}

          <Panel>
            <Stack>
              <Kicker>에프터케어</Kicker>
              <Heading>선택한 스타일을 시술 기록으로 확정</Heading>
              <BodyText>선택한 헤어스타일을 확정하면 웹 결과 흐름과 같은 에프터케어 가이드가 생성됩니다.</BodyText>
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
              <TextField label="시술일" onChangeText={setServiceDate} placeholder="YYYY-MM-DD" value={serviceDate} />
              <Button disabled={!primary?.id || aftercarePending} onPress={createAftercare}>
                {aftercarePending ? "에프터케어 생성 중..." : "에프터케어 가이드 만들기"}
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
            패션 스타일러로 계속
          </Button>
          <Button variant="secondary" onPress={() => router.push(`/generate/${generationId}`)}>3x3 보드 열기</Button>
          <Button variant="secondary" onPress={() => router.push("/mypage")}>마이페이지 열기</Button>
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
