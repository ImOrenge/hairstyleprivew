import type { GeneratedVariant } from "@hairfit/shared";
import { BodyText, Button, Card, Heading, Kicker, Panel, Screen, Stack } from "@hairfit/ui-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useHairfitApi } from "../lib/api";
import { useGenerationFlow } from "../lib/generation-flow";

function variantTitle(variant: GeneratedVariant, index: number) {
  return variant.label || `Recommendation ${index + 1}`;
}

export default function GenerateScreen() {
  const router = useRouter();
  const api = useHairfitApi();
  const flow = useGenerationFlow();
  const [pending, setPending] = useState<"recommendations" | string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
      setMessage(`Created ${result.recommendations.length} recommendations.`);
      router.push(`/generate/${result.generationId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create recommendations.");
    } finally {
      setPending(null);
    }
  };

  const runVariant = async (variant: GeneratedVariant, index: number) => {
    if (!flow.draft || pending) return;
    const token = variant.promptArtifactToken;
    if (!token) {
      setMessage("This recommendation is missing its prompt token.");
      return;
    }

    setPending(variant.id);
    setMessage(null);
    try {
      await api.runGeneration({
        generationId: flow.draft.generationId,
        prompt: variant.prompt,
        promptArtifactToken: token,
        imageDataUrl: flow.draft.imageDataUrl,
        variantIndex: index,
        variantId: variant.id,
        catalogItemId: variant.catalogItemId ?? null,
      });
      router.push(`/result/${flow.draft.generationId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Generation failed.");
    } finally {
      setPending(null);
    }
  };

  return (
    <Screen>
      <Stack>
        <Kicker>Generate</Kicker>
        <Heading>Nine tailored hairstyle directions</Heading>
        <BodyText>Create the same 3x3 recommendation board as the web app, then render the cards you want to compare.</BodyText>
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

          <Button disabled={!flow.imageDataUrl || pending === "recommendations"} onPress={createRecommendations}>
            {pending === "recommendations" ? "Creating board..." : "Create 3x3 board"}
          </Button>

          {flow.draft ? (
            <Stack>
              <Kicker>Recommendations</Kicker>
              {flow.draft.recommendations.map((variant, index) => (
                <Card key={variant.id || index}>
                  <Stack gap={10}>
                    <Heading>{variantTitle(variant, index)}</Heading>
                    <BodyText>{variant.reason}</BodyText>
                    <Button disabled={Boolean(pending)} onPress={() => runVariant(variant, index)}>
                      {pending === variant.id ? "Rendering..." : "Render this style"}
                    </Button>
                  </Stack>
                </Card>
              ))}
            </Stack>
          ) : null}

          {message ? <BodyText>{message}</BodyText> : null}
          <Button variant="secondary" onPress={() => router.back()}>Back</Button>
        </Stack>
      </Panel>
    </Screen>
  );
}
