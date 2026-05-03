import type { FashionGenre, StylingSessionDetails } from "@hairfit/shared";
import { BodyText, Button, Card, Chip, Cluster, Heading, Kicker, Panel, Screen, Stack } from "@hairfit/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useHairfitApi } from "../../lib/api";

const genreLabelMap: Record<FashionGenre, string> = {
  minimal: "Minimal",
  street: "Street",
  casual: "Casual",
  classic: "Classic",
  office: "Office",
  date: "Date",
  formal: "Formal",
  athleisure: "Athleisure",
};

function formatStatus(status: string) {
  if (status === "completed") return "Completed";
  if (status === "generating") return "Generating";
  if (status === "recommended") return "Recommended";
  if (status === "failed") return "Failed";
  return status;
}

export default function StylerResultScreen() {
  const router = useRouter();
  const api = useHairfitApi();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = typeof id === "string" ? id : "";
  const [session, setSession] = useState<StylingSessionDetails | null>(null);
  const [message, setMessage] = useState("Loading fashion lookbook...");

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      if (!sessionId) return;
      setMessage("Loading fashion lookbook...");
      try {
        const result = await api.getStylingSession(sessionId);
        if (!cancelled) {
          setSession(result.session);
          setMessage("Selected hairstyle and body profile were used to build this outfit direction.");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Failed to load fashion lookbook.");
        }
      }
    }

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [api, sessionId]);

  const recommendation = session?.recommendation || null;
  const genre = session?.genre || recommendation?.genre || null;

  return (
    <Screen>
      <Stack>
        <Kicker>Fashion Lookbook</Kicker>
        <Heading>{recommendation?.headline || "Fashion recommendation result"}</Heading>
        <BodyText>{message}</BodyText>
      </Stack>

      {session ? (
        <Panel>
          <Stack>
            <View style={styles.preview}>
              {session.imageUrl ? (
                <Image source={{ uri: session.imageUrl }} style={styles.image} />
              ) : (
                <BodyText>Lookbook image is not available yet. Current status: {formatStatus(session.status)}</BodyText>
              )}
            </View>

            <Card>
              <Stack gap={10}>
                <Kicker>Recommendation Summary</Kicker>
                <BodyText>{recommendation?.summary || "-"}</BodyText>
                <Cluster>
                  {(recommendation?.palette || []).map((color) => (
                    <Chip key={color}>{color}</Chip>
                  ))}
                </Cluster>
                <BodyText>
                  Genre: {genre ? genreLabelMap[genre] : session.occasion} · Status: {formatStatus(session.status)} · Credits: {session.creditsUsed}
                </BodyText>
              </Stack>
            </Card>

            <Card>
              <Stack>
                <Kicker>Styling Notes</Kicker>
                {(recommendation?.stylingNotes || []).map((note) => (
                  <BodyText key={note}>{note}</BodyText>
                ))}
              </Stack>
            </Card>

            <Cluster>
              <Button
                variant="secondary"
                onPress={() =>
                  router.push(`/result/${session.generationId}?variant=${encodeURIComponent(session.selectedVariantId)}`)
                }
              >
                Back to hair result
              </Button>
              <Button variant="secondary" onPress={() => router.push("/styler/new")}>New fashion recommendation</Button>
            </Cluster>
          </Stack>
        </Panel>
      ) : null}

      {recommendation ? (
        <Stack>
          <Kicker>Recommended Items</Kicker>
          <Heading>Outfit composition</Heading>
          {recommendation.items.map((item) => (
            <Card key={item.slot}>
              <Stack gap={10}>
                <Kicker>{item.slot}</Kicker>
                <Heading>{item.name}</Heading>
                <BodyText>{item.description}</BodyText>
                <BodyText>Color: {item.color}</BodyText>
                <BodyText>Fit: {item.fit}</BodyText>
                <BodyText>Material: {item.material}</BodyText>
                <BodyText>Brand: {item.brandName || "Brand link pending"}</BodyText>
              </Stack>
            </Card>
          ))}
        </Stack>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: {
    alignItems: "center",
    aspectRatio: 3 / 4,
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
