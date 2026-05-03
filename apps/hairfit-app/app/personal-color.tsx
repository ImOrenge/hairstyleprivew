import { useAuth } from "@clerk/clerk-expo";
import type { PersonalColorResult } from "@hairfit/shared";
import {
  BodyText,
  Button,
  Card,
  Cluster,
  Heading,
  Kicker,
  Panel,
  Screen,
  Stack,
  colors,
} from "@hairfit/ui-native";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import {
  FaceScanOverlay,
  PersonalColorDiagnosisProgress,
  PersonalColorSwatchAnalysisColumn,
} from "../components/PersonalColorDiagnosisProgress";
import { useHairfitApi } from "../lib/api";
import { useGenerationFlow } from "../lib/generation-flow";

type PersonalColorSource = "upload" | "mypage";

function normalizeSource(value: unknown): PersonalColorSource {
  const first = Array.isArray(value) ? value[0] : value;
  return first === "mypage" ? "mypage" : "upload";
}

function formatPersonalColor(result: PersonalColorResult | null) {
  if (!result) return "No diagnosis yet";
  return `${result.tone} tone / ${result.contrast} contrast`;
}

function ColorSwatchList({ colors: swatches }: { colors: PersonalColorResult["bestColors"] }) {
  if (!swatches.length) {
    return <BodyText>No colors saved.</BodyText>;
  }

  return (
    <Cluster>
      {swatches.slice(0, 6).map((swatch) => (
        <View key={`${swatch.nameEn}-${swatch.hex}`} style={styles.swatchChip}>
          <View style={[styles.swatchDot, { backgroundColor: swatch.hex }]} />
          <BodyText style={styles.swatchText}>{swatch.nameKo}</BodyText>
        </View>
      ))}
    </Cluster>
  );
}

export default function PersonalColorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const api = useHairfitApi();
  const flow = useGenerationFlow();
  const { isLoaded, isSignedIn } = useAuth();
  const source = normalizeSource(params.source);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [result, setResult] = useState<PersonalColorResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/login");
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (source === "upload" && flow.imageDataUrl && !imageDataUrl) {
      setImageDataUrl(flow.imageDataUrl);
      setImageUri(flow.imageDataUrl);
    }
  }, [flow.imageDataUrl, imageDataUrl, source]);

  const returnPath = useMemo(() => {
    if (source === "mypage") return "/mypage?tab=body-profile";
    return flow.imageDataUrl ? "/generate" : "/upload";
  }, [flow.imageDataUrl, source]);

  const pickImage = async () => {
    if (isAnalyzing) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage("Photo library permission is required.");
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [4, 5],
      base64: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });

    if (pickerResult.canceled) {
      setMessage("Image selection was cancelled.");
      return;
    }

    const asset = pickerResult.assets[0];
    if (!asset?.uri || !asset.base64) {
      setMessage("Could not read the selected image.");
      return;
    }

    const mimeType = asset.mimeType || "image/jpeg";
    const dataUrl = `data:${mimeType};base64,${asset.base64}`;
    setImageUri(asset.uri);
    setImageDataUrl(dataUrl);
    setResult(null);
    setMessage(null);

    if (source === "upload") {
      flow.setImageDataUrl(dataUrl);
      flow.setDraft(null);
    }
  };

  const analyze = async () => {
    if (!imageDataUrl || isAnalyzing) {
      return;
    }

    setIsAnalyzing(true);
    setMessage(null);
    try {
      const analyzed = await api.analyzePersonalColor(imageDataUrl);
      setResult(analyzed.personalColor);
      setMessage("Personal color result was saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to analyze personal color.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (isLoaded && !isSignedIn) {
    return (
      <Screen>
        <Stack>
          <Kicker>Personal Color</Kicker>
          <Heading>로그인이 필요합니다</Heading>
          <BodyText>퍼스널컬러 진단을 진행하려면 먼저 로그인해 주세요.</BodyText>
        </Stack>
      </Screen>
    );
  }

  return (
    <Screen>
      <Panel>
        <Stack>
          <Kicker>Personal Color</Kicker>
          <Heading>Personal color diagnosis</Heading>
          <BodyText>
            {source === "upload"
              ? "Use the uploaded portrait, then return to generation after reviewing the result."
              : "Choose a clear face photo and save the result for styling recommendations."}
          </BodyText>
        </Stack>
      </Panel>

      <Panel>
        <Stack>
          <View style={styles.preview}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.image} />
            ) : (
              <Stack gap={8} style={styles.emptyPreview}>
                <BodyText style={styles.centerStrong}>
                  {source === "upload" ? "No upload image found" : "No face photo selected"}
                </BodyText>
                <BodyText style={styles.centerText}>Choose a front-facing face photo to continue.</BodyText>
              </Stack>
            )}
            <FaceScanOverlay active={isAnalyzing} />
          </View>

          {isAnalyzing ? (
            <Stack>
              <PersonalColorDiagnosisProgress />
              <PersonalColorSwatchAnalysisColumn />
            </Stack>
          ) : null}
          {message ? <Card><BodyText>{message}</BodyText></Card> : null}

          {!result ? (
            <Card>
              <Stack>
                <Kicker>Before diagnosis</Kicker>
                <BodyText>
                  The analysis compares warm/cool balance, contrast, best colors, and avoid colors for styling use.
                </BodyText>
                <Button disabled={isAnalyzing} onPress={pickImage}>
                  {imageUri ? "Change photo" : "Choose photo"}
                </Button>
                <Button disabled={!imageDataUrl || isAnalyzing} onPress={analyze}>
                  {isAnalyzing ? "Analyzing..." : "Start diagnosis"}
                </Button>
              </Stack>
            </Card>
          ) : (
            <Card>
              <Stack>
                <Kicker>Diagnosis saved</Kicker>
                <Heading style={styles.resultHeading}>{formatPersonalColor(result)}</Heading>
                <BodyText>{result.summary}</BodyText>
                <Kicker>Best colors</Kicker>
                <ColorSwatchList colors={result.bestColors} />
                <Kicker>Avoid colors</Kicker>
                <ColorSwatchList colors={result.avoidColors} />
                <Button onPress={() => router.push(returnPath)}>
                  {source === "upload" ? "Continue to generation" : "Back to body profile"}
                </Button>
                <Button variant="secondary" disabled={isAnalyzing} onPress={pickImage}>
                  Choose another photo
                </Button>
              </Stack>
            </Card>
          )}

          <Button variant="secondary" onPress={() => router.push(returnPath)} disabled={isAnalyzing}>
            Back
          </Button>
        </Stack>
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerStrong: {
    color: colors.text,
    fontWeight: "900",
    textAlign: "center",
  },
  centerText: {
    textAlign: "center",
  },
  emptyPreview: {
    paddingHorizontal: 24,
  },
  image: {
    height: "100%",
    width: "100%",
  },
  preview: {
    alignItems: "center",
    aspectRatio: 4 / 5,
    backgroundColor: "#eee8de",
    borderColor: "#ded6ca",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  resultHeading: {
    fontSize: 22,
    lineHeight: 28,
  },
  swatchChip: {
    alignItems: "center",
    backgroundColor: "#fffdf8",
    borderColor: "#ded6ca",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  swatchDot: {
    borderColor: "rgba(0,0,0,0.12)",
    borderRadius: 999,
    borderWidth: 1,
    height: 16,
    width: 16,
  },
  swatchText: {
    color: "#181411",
    fontSize: 12,
    fontWeight: "800",
  },
});
