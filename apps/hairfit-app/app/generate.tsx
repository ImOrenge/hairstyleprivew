import type { GeneratedVariant } from "@hairfit/shared";
import { HairfitApiError } from "@hairfit/api-client";
import { BodyText, Button, Card, Heading, Kicker, Panel, Screen, Stack } from "@hairfit/ui-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useHairfitApi } from "../lib/api";
import { useGenerationFlow } from "../lib/generation-flow";

function readRedirectTo(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("redirectTo" in payload)) {
    return null;
  }

  const redirectTo = (payload as { redirectTo?: unknown }).redirectTo;
  return typeof redirectTo === "string" && redirectTo.trim() ? redirectTo : null;
}

function readErrorCode(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("code" in payload)) return null;
  return typeof payload.code === "string" ? payload.code : null;
}

export default function GenerateScreen() {
  const router = useRouter();
  const api = useHairfitApi();
  const flow = useGenerationFlow();
  const [pending, setPending] = useState<"recommendations" | "starting" | null>(null);
  const [retryGenerationId, setRetryGenerationId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const runLocalLegacyGeneration = async (
    generationId: string,
    recommendations: GeneratedVariant[],
    imageDataUrl: string,
  ) => {
    let completedCount = 0;
    for (const [variantIndex, variant] of recommendations.entries()) {
      if (!variant.promptArtifactToken) continue;
      try {
        await api.runGeneration({
          generationId,
          prompt: variant.prompt,
          promptArtifactToken: variant.promptArtifactToken,
          imageDataUrl,
          variantIndex,
          variantId: variant.id,
          catalogItemId: variant.catalogItemId ?? null,
        });
        completedCount += 1;
      } catch {
        // Local development fallback keeps rendering the remaining variants.
      }
    }
    if (completedCount === 0) {
      throw new Error("로컬 생성 대체 경로에서 완료된 후보가 없습니다.");
    }
  };

  const createRecommendations = async () => {
    if (!flow.imageDataUrl || pending) return;
    setPending("recommendations");
    setMessage(null);

    try {
      const result = await api.createRecommendations(flow.imageDataUrl);
      flow.setDraft({
        generationId: result.generationId,
        imageDataUrl: flow.imageDataUrl,
        recommendations: result.recommendations,
      });
      setRetryGenerationId(result.generationId);
      setPending("starting");
      setMessage("추천 보드를 준비했습니다. 백그라운드 생성을 시작하고 있어요.");

      try {
        await api.startGeneration(result.generationId);
        setRetryGenerationId(null);
        router.replace(`/generate/${result.generationId}`);
      } catch (error) {
        const canUseLocalFallback =
          process.env.NODE_ENV === "development" &&
          error instanceof HairfitApiError &&
          readErrorCode(error.payload) === "GENERATION_WORKFLOW_UNAVAILABLE";
        if (canUseLocalFallback) {
          setMessage("로컬 개발 환경에서 후보를 순차 생성하고 있습니다. 이 화면을 유지해 주세요.");
          await runLocalLegacyGeneration(
            result.generationId,
            result.recommendations,
            flow.imageDataUrl,
          );
          setRetryGenerationId(null);
          router.replace(`/generate/${result.generationId}`);
          return;
        }
        setMessage(
          error instanceof Error
            ? `백그라운드 생성을 시작하지 못했습니다. ${error.message}`
            : "백그라운드 생성을 시작하지 못했습니다.",
        );
      }
    } catch (error) {
      if (error instanceof HairfitApiError) {
        const redirectTo = readRedirectTo(error.payload);
        if (redirectTo) {
          router.push(redirectTo);
          return;
        }
      }
      setMessage(error instanceof Error ? error.message : "추천 보드를 만들지 못했습니다.");
    } finally {
      setPending(null);
    }
  };

  const retryBackgroundGeneration = async () => {
    if (!retryGenerationId || pending) return;
    setPending("starting");
    setMessage("백그라운드 생성을 다시 시작하고 있어요.");
    try {
      await api.startGeneration(retryGenerationId);
      const generationId = retryGenerationId;
      setRetryGenerationId(null);
      router.replace(`/generate/${generationId}`);
    } catch (error) {
      const canUseLocalFallback =
        process.env.NODE_ENV === "development" &&
        error instanceof HairfitApiError &&
        readErrorCode(error.payload) === "GENERATION_WORKFLOW_UNAVAILABLE" &&
        flow.draft?.generationId === retryGenerationId;
      if (canUseLocalFallback && flow.draft) {
        setMessage("로컬 개발 환경에서 후보를 순차 생성하고 있습니다. 이 화면을 유지해 주세요.");
        try {
          await runLocalLegacyGeneration(
            flow.draft.generationId,
            flow.draft.recommendations,
            flow.draft.imageDataUrl,
          );
          const generationId = flow.draft.generationId;
          setRetryGenerationId(null);
          router.replace(`/generate/${generationId}`);
        } catch (localError) {
          setMessage(
            localError instanceof Error
              ? localError.message
              : "로컬 생성 대체 경로가 실패했습니다.",
          );
        }
        return;
      }
      setMessage(
        error instanceof Error
          ? `백그라운드 생성을 시작하지 못했습니다. ${error.message}`
          : "백그라운드 생성을 시작하지 못했습니다.",
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <Screen>
      <Stack>
        <Kicker>Generate</Kicker>
        <Heading>Nine tailored hairstyle directions</Heading>
        <BodyText>3x3 추천 보드를 만든 뒤 9개 헤어스타일을 백그라운드에서 차례로 생성합니다.</BodyText>
        <BodyText>생성이 시작되면 다른 화면으로 이동하거나 앱을 닫아도 계속 진행되며, 완료 시 가입 이메일로 알려드립니다.</BodyText>
        <BodyText>추천 보드 화면으로 이동하기 전까지는 분석과 작업 접수 단계이므로 앱을 유지해 주세요.</BodyText>
      </Stack>

      <Panel>
        <Stack>
          {!flow.imageDataUrl ? (
            <Card>
              <Stack>
                <Kicker>Missing portrait</Kicker>
                <BodyText>Go back and choose a portrait before starting generation.</BodyText>
                <Button onPress={() => router.replace("/upload")}>Choose portrait</Button>
              </Stack>
            </Card>
          ) : null}

          <Button disabled={!flow.imageDataUrl || Boolean(pending) || Boolean(retryGenerationId)} onPress={createRecommendations}>
            {pending === "recommendations"
              ? "추천 보드 준비 중..."
              : pending === "starting"
                ? "백그라운드 생성 시작 중..."
                : "3x3 보드 생성하기"}
          </Button>

          {retryGenerationId ? (
            <Card>
              <Stack gap={10}>
                <Kicker>시작 대기</Kicker>
                <Heading>추천 보드는 안전하게 저장되었습니다</Heading>
                <BodyText>새 보드를 다시 만들 필요 없이 백그라운드 생성만 다시 시작할 수 있습니다.</BodyText>
                <Button disabled={Boolean(pending)} onPress={retryBackgroundGeneration}>
                  {pending === "starting" ? "다시 시작하는 중..." : "백그라운드 생성 다시 시작"}
                </Button>
              </Stack>
            </Card>
          ) : null}

          {message ? <BodyText>{message}</BodyText> : null}
          <Button variant="secondary" onPress={() => router.back()}>Back</Button>
        </Stack>
      </Panel>
    </Screen>
  );
}
