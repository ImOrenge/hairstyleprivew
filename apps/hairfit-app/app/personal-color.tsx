import { useAuth } from "@clerk/clerk-expo";
import type { PersonalColorResult } from "@hairfit/shared";
import {
  BodyText,
  Button,
  Card,
  Heading,
  Kicker,
  Panel,
  Stack,
  colors,
} from "@hairfit/ui-native";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { AppScreen } from "../components/app/AppScreen";
import {
  FaceScanOverlay,
  PersonalColorDiagnosisProgress,
  PersonalColorSwatchAnalysisColumn,
} from "../components/PersonalColorDiagnosisProgress";
import { PersonalColorResultDetails } from "../components/PersonalColorResultDetails";
import { PhotoLibraryPermissionRecovery } from "../components/app/PhotoLibraryPermissionRecovery";
import { useHairfitApi } from "../lib/api";
import { useGenerationFlow } from "../lib/generation-flow";
import { mapMobileUserError } from "../lib/mobile-user-message";
import { getPhotoLibraryPermissionMessage } from "../lib/photo-library-permission";
import { usePhotoLibraryPermissionRecovery } from "../hooks/usePhotoLibraryPermissionRecovery";

type PersonalColorSource = "upload" | "mypage";

function normalizeSource(value: unknown): PersonalColorSource {
  const first = Array.isArray(value) ? value[0] : value;
  return first === "mypage" ? "mypage" : "upload";
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
  const {
    openPermissionSettings,
    photoPermissionRequiresSettings,
    resolvePhotoLibraryPermission,
  } = usePhotoLibraryPermissionRecovery();

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
    if (source === "mypage") return "/mypage?tab=personal-color";
    return flow.imageDataUrl ? "/generate" : "/upload";
  }, [flow.imageDataUrl, source]);

  const handleOpenPermissionSettings = useCallback(async () => {
    const opened = await openPermissionSettings();
    setMessage(opened
      ? "앱 설정에서 사진 권한을 허용한 뒤 HairFit으로 돌아와 다시 선택해 주세요."
      : "앱 설정을 열지 못했습니다. 기기 설정에서 HairFit의 사진 권한을 직접 허용해 주세요.");
  }, [openPermissionSettings]);

  const pickImage = async () => {
    if (isAnalyzing) return;

    let permission;
    try {
      permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    } catch (error) {
      setMessage(mapMobileUserError(
        error,
        "사진 보관함 권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      ));
      return;
    }
    const permissionState = resolvePhotoLibraryPermission(permission);
    if (permissionState !== "granted") {
      setMessage(getPhotoLibraryPermissionMessage(permissionState));
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
      setMessage("사진 선택을 취소했습니다.");
      return;
    }

    const asset = pickerResult.assets[0];
    if (!asset?.uri || !asset.base64) {
      setMessage("선택한 사진을 읽지 못했습니다. 다른 사진으로 다시 시도해 주세요.");
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
      setMessage("퍼스널컬러 진단 결과를 저장했습니다.");
    } catch (error) {
      setMessage(mapMobileUserError(
        error,
        "퍼스널컬러를 진단하지 못했습니다. 사진을 확인하고 다시 시도해 주세요.",
        "photo",
      ));
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (isLoaded && !isSignedIn) {
    return (
      <AppScreen>
        <Stack>
          <Kicker>퍼스널컬러</Kicker>
          <Heading>로그인이 필요합니다</Heading>
          <BodyText>퍼스널컬러 진단을 진행하려면 먼저 로그인해 주세요.</BodyText>
        </Stack>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <Panel>
        <Stack>
          <Kicker>퍼스널컬러</Kicker>
          <Heading>퍼스널컬러 진단</Heading>
          <BodyText>
            {source === "upload"
              ? "업로드한 정면 사진으로 진단하고 결과를 확인한 뒤 헤어 생성으로 돌아갑니다."
              : "얼굴이 선명한 정면 사진을 선택하면 스타일 추천에 사용할 결과를 저장합니다."}
          </BodyText>
        </Stack>
      </Panel>

      <Panel>
        <Stack>
          <View style={styles.preview}>
            {imageUri ? (
              <Image
                accessibilityLabel="퍼스널컬러 진단에 사용할 정면 얼굴 사진"
                accessibilityRole="image"
                source={{ uri: imageUri }}
                style={styles.image}
              />
            ) : (
              <Stack gap={8} style={styles.emptyPreview}>
                <BodyText style={styles.centerStrong}>
                  {source === "upload" ? "업로드한 사진이 없습니다" : "선택한 얼굴 사진이 없습니다"}
                </BodyText>
                <BodyText style={styles.centerText}>계속하려면 얼굴이 정면으로 보이는 사진을 선택해 주세요.</BodyText>
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
          {message ? (
            <View accessibilityLiveRegion="polite">
              <Card><BodyText>{message}</BodyText></Card>
            </View>
          ) : null}
          <PhotoLibraryPermissionRecovery
            onOpenSettings={() => void handleOpenPermissionSettings()}
            visible={photoPermissionRequiresSettings}
          />

          {!result ? (
            <Card>
              <Stack>
                <Kicker>진단 전 확인</Kicker>
                <BodyText>
                  웜·쿨 균형, 대비, 추천 색상과 피하면 좋은 색상을 비교해 스타일링에 활용합니다.
                </BodyText>
                <Button disabled={isAnalyzing} onPress={pickImage}>
                  {imageUri ? "사진 변경" : "사진 선택"}
                </Button>
                <Button disabled={!imageDataUrl || isAnalyzing} onPress={analyze}>
                  {isAnalyzing ? "진단 중..." : "퍼스널컬러 진단 시작"}
                </Button>
              </Stack>
            </Card>
          ) : (
            <Stack>
              <PersonalColorResultDetails result={result} />
              <Stack>
                <Button onPress={() => router.push(returnPath)}>
                  {source === "upload" ? "헤어 생성으로 계속" : "마이페이지로 돌아가기"}
                </Button>
                <Button variant="secondary" disabled={isAnalyzing} onPress={pickImage}>
                  다른 사진 선택
                </Button>
              </Stack>
            </Stack>
          )}

          <Button variant="secondary" onPress={() => router.push(returnPath)} disabled={isAnalyzing}>
            이전 화면으로
          </Button>
        </Stack>
      </Panel>
    </AppScreen>
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
});
