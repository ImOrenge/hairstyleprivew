import { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useAuth, useUser } from "@clerk/clerk-expo";
import type { PersonalColorResult } from "@hairfit/shared";
import { useRouter } from "expo-router";
import { BodyText, Button, Card, Heading, Kicker, Panel, Screen, Stack } from "@hairfit/ui-native";
import { useHairfitApi } from "../lib/api";
import { useGenerationFlow } from "../lib/generation-flow";

type AccountType = "member" | "salon_owner" | "admin" | null;

function normalizeAccountType(value: unknown): AccountType {
  if (value === "member" || value === "salon_owner" || value === "admin") {
    return value;
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readMetadataValue(source: unknown, key: "accountType") {
  const record = asRecord(source);
  if (!record) {
    return undefined;
  }

  const nestedSources = [
    record,
    asRecord(record.metadata),
    asRecord(record.publicMetadata),
    asRecord(record.public_metadata),
  ];

  for (const nested of nestedSources) {
    if (nested && key in nested) {
      return nested[key];
    }
  }

  return undefined;
}

export default function UploadScreen() {
  const router = useRouter();
  const api = useHairfitApi();
  const { isLoaded, isSignedIn, sessionClaims } = useAuth();
  const { user } = useUser();
  const accountType = normalizeAccountType(
    user?.publicMetadata?.accountType ?? readMetadataValue(sessionClaims, "accountType"),
  );
  const flow = useGenerationFlow();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [message, setMessage] = useState("Choose a clear front-facing portrait.");
  const [personalColor, setPersonalColor] = useState<PersonalColorResult | null>(null);
  const [isLoadingPersonalColor, setIsLoadingPersonalColor] = useState(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/login");
      return;
    }

    if (isLoaded && isSignedIn && accountType === "salon_owner") {
      router.replace("/salon/customers");
    }
  }, [accountType, isLoaded, isSignedIn, router]);

  useEffect(() => {
    let cancelled = false;

    async function loadPersonalColor() {
      if (!isLoaded || !isSignedIn || accountType === "salon_owner") {
        return;
      }

      setIsLoadingPersonalColor(true);
      try {
        const result = await api.getStyleProfile();
        if (!cancelled) {
          setPersonalColor(result.profile.personalColor);
        }
      } catch {
        if (!cancelled) {
          setPersonalColor(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPersonalColor(false);
        }
      }
    }

    void loadPersonalColor();
    return () => {
      cancelled = true;
    };
  }, [accountType, api, isLoaded, isSignedIn]);

  useEffect(() => {
    if (!imageUri && flow.imageDataUrl) {
      setImageUri(flow.imageDataUrl);
    }
  }, [flow.imageDataUrl, imageUri]);

  if (isLoaded && !isSignedIn) {
    return (
      <Screen>
        <Stack>
          <Kicker>Workspace</Kicker>
          <Heading>로그인이 필요합니다</Heading>
          <BodyText>워크스페이스를 열려면 먼저 로그인해 주세요.</BodyText>
        </Stack>
      </Screen>
    );
  }

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage("Photo library permission is required.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [4, 5],
      base64: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });

    if (result.canceled) {
      setMessage("Image selection was cancelled.");
      return;
    }

    const asset = result.assets[0];
    const base64 = asset?.base64;
    if (!asset?.uri || !base64) {
      setMessage("Could not read the selected image.");
      return;
    }

    const mimeType = asset.mimeType || "image/jpeg";
    const dataUrl = `data:${mimeType};base64,${base64}`;
    flow.setImageDataUrl(dataUrl);
    flow.setDraft(null);
    setImageUri(asset.uri);
    setMessage("Portrait is ready. Continue to create the 3x3 recommendation board.");
  };

  const previewSource = imageUri || flow.imageDataUrl;
  const hasUploadImage = Boolean(previewSource);

  return (
    <Screen>
      <Stack>
        <Kicker>Upload</Kicker>
        <Heading>Select a portrait</Heading>
        <BodyText>The mobile picker stores an in-memory data URL and sends it to the existing recommendation API.</BodyText>
      </Stack>

      <Panel>
        <Stack>
          <View style={styles.preview}>
            {previewSource ? <Image source={{ uri: previewSource }} style={styles.image} /> : <BodyText>No preview yet</BodyText>}
          </View>
          <Card>
            <BodyText>{message}</BodyText>
          </Card>
          {!isLoadingPersonalColor && !personalColor ? (
            <Card>
              <Stack>
                <Kicker>Personal Color</Kicker>
                <Heading style={{ fontSize: 20, lineHeight: 26 }}>First personal color diagnosis</Heading>
                <BodyText>
                  {hasUploadImage
                    ? "Analyze the selected portrait, then use warm/cool tone and contrast in fashion styling."
                    : "You can choose a face photo on the diagnosis page if no portrait is selected yet."}
                </BodyText>
                <Button onPress={() => router.push("/personal-color?source=upload")}>
                  Start first diagnosis
                </Button>
              </Stack>
            </Card>
          ) : null}
          {imageUri && personalColor ? (
            <Card>
              <Stack>
                <Kicker>Personal Color Saved</Kicker>
                <BodyText>
                  {personalColor.tone} tone / {personalColor.contrast} contrast
                </BodyText>
                <BodyText>{personalColor.summary}</BodyText>
              </Stack>
            </Card>
          ) : null}
          <Button onPress={pickImage}>Choose photo</Button>
          <Button disabled={!flow.imageDataUrl} onPress={() => router.push("/generate")}>
            Continue to generation
          </Button>
          <Button variant="secondary" onPress={() => router.back()}>Back</Button>
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
    position: "relative",
    width: "100%",
  },
  image: {
    height: "100%",
    width: "100%",
  },
});
