import { useCallback, useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import { useAuth } from "@clerk/clerk-expo";
import {
  getBase64DecodedByteSize,
  getGenerationUploadValidationMessage,
  resolveGenerationEntryDecision,
  validateGenerationUploadMetadata,
  type PersonalColorResult,
} from "@hairfit/shared";
import { type Href, useRouter } from "expo-router";
import { BodyText, Button, Card, Heading, Kicker, Panel, Stack } from "@hairfit/ui-native";
import { AppScreen } from "../components/app/AppScreen";
import { useHairfitApi } from "../lib/api";
import { useGenerationFlow } from "../lib/generation-flow";
import { useSafeBackNavigation } from "../hooks/useSafeBackNavigation";
import { PhotoLibraryPermissionRecovery } from "../components/app/PhotoLibraryPermissionRecovery";
import { mapMobileUserError } from "../lib/mobile-user-message";
import { getPhotoLibraryPermissionMessage } from "../lib/photo-library-permission";
import { usePhotoLibraryPermissionRecovery } from "../hooks/usePhotoLibraryPermissionRecovery";

export default function UploadScreen() {
  const router = useRouter();
  const api = useHairfitApi();
  const { isLoaded, isSignedIn } = useAuth();
  const flow = useGenerationFlow();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [message, setMessage] = useState("얼굴이 선명하게 보이는 정면 사진을 선택해 주세요.");
  const [messageLiveRegion, setMessageLiveRegion] = useState<"polite" | "assertive">("polite");
  const [personalColor, setPersonalColor] = useState<PersonalColorResult | null>(null);
  const [isLoadingPersonalColor, setIsLoadingPersonalColor] = useState(false);
  const [isUploadingPortrait, setIsUploadingPortrait] = useState(false);
  const [entryCheckState, setEntryCheckState] = useState<"checking" | "allowed" | "redirecting" | "error">("checking");
  const [entryCheckError, setEntryCheckError] = useState<string | null>(null);
  const [entryCheckVersion, setEntryCheckVersion] = useState(0);
  const {
    openPermissionSettings,
    photoPermissionRequiresSettings,
    resolvePhotoLibraryPermission,
  } = usePhotoLibraryPermissionRecovery();
  const showMessage = useCallback((nextMessage: string, tone: "polite" | "assertive" = "polite") => {
    setMessage(nextMessage);
    setMessageLiveRegion(tone);
  }, []);
  const explainBlockedBack = useCallback(() => {
    showMessage("사진을 안전하게 저장하고 있습니다. 업로드 완료 안내가 표시된 뒤 이동해 주세요.");
  }, [showMessage]);
  const navigateBack = useSafeBackNavigation({
    blocked: isUploadingPortrait,
    fallback: "/",
    onBlocked: explainBlockedBack,
  });
  const handleOpenPermissionSettings = useCallback(async () => {
    const opened = await openPermissionSettings();
    showMessage(
      opened
        ? "앱 설정에서 사진 권한을 허용한 뒤 HairFit으로 돌아와 다시 선택해 주세요."
        : "앱 설정을 열지 못했습니다. 기기 설정에서 HairFit의 사진 권한을 직접 허용해 주세요.",
      opened ? "polite" : "assertive",
    );
  }, [openPermissionSettings, showMessage]);

  useEffect(() => {
    let cancelled = false;

    async function verifyGenerationEntry() {
      if (!isLoaded) {
        setEntryCheckState("checking");
        return;
      }

      if (!isSignedIn) {
        setEntryCheckState("redirecting");
        router.replace("/login");
        return;
      }

      setEntryCheckState("checking");
      setEntryCheckError(null);
      try {
        const account = await api.getMobileMe();
        if (cancelled) return;

        const decision = resolveGenerationEntryDecision({
          accountSetupComplete: account.accountSetupComplete,
          accountType: account.accountType,
          continuation: "generation-upload",
          styleTarget: account.styleTarget,
        });
        if (decision.kind === "allow") {
          setEntryCheckState("allowed");
          return;
        }

        setEntryCheckState("redirecting");
        router.replace(decision.path as Href);
      } catch (error) {
        if (!cancelled) {
          setEntryCheckState("error");
          setEntryCheckError(mapMobileUserError(
            error,
            "계정 설정을 확인하지 못했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.",
          ));
        }
      }
    }

    void verifyGenerationEntry();
    return () => {
      cancelled = true;
    };
  }, [api, entryCheckVersion, isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (entryCheckState !== "allowed") {
      return;
    }
    let cancelled = false;

    async function loadPersonalColor() {
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
  }, [api, entryCheckState]);

  useEffect(() => {
    if (!imageUri && flow.imageDataUrl) {
      setImageUri(flow.imageDataUrl);
    }
  }, [flow.imageDataUrl, imageUri]);

  if (!isLoaded || entryCheckState === "checking" || entryCheckState === "redirecting") {
    return (
      <AppScreen>
        <Card>
          <View accessibilityLiveRegion="polite" accessibilityRole="progressbar">
            <BodyText>
              {entryCheckState === "redirecting"
                ? "계정에 맞는 화면으로 이동하고 있습니다."
                : "헤어 생성에 필요한 계정 설정을 확인하고 있습니다."}
            </BodyText>
          </View>
        </Card>
      </AppScreen>
    );
  }

  if (entryCheckState === "error") {
    return (
      <AppScreen>
        <Panel>
          <Stack>
            <Kicker>계정 설정 확인</Kicker>
            <Heading>생성 준비 상태를 확인하지 못했습니다</Heading>
            <View accessibilityLiveRegion="assertive" accessibilityRole="alert">
              <BodyText>{entryCheckError}</BodyText>
            </View>
            <Button onPress={() => setEntryCheckVersion((current) => current + 1)}>
              다시 확인
            </Button>
          </Stack>
        </Panel>
      </AppScreen>
    );
  }

  if (!isSignedIn) {
    return (
      <AppScreen>
        <Stack>
          <Kicker>헤어 워크스페이스</Kicker>
          <Heading>로그인이 필요합니다</Heading>
          <BodyText>워크스페이스를 열려면 먼저 로그인해 주세요.</BodyText>
        </Stack>
      </AppScreen>
    );
  }

  const pickImage = async () => {
    if (isUploadingPortrait) return;
    let permission;
    try {
      permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    } catch (error) {
      showMessage(mapMobileUserError(
        error,
        "사진 보관함 권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      ), "assertive");
      return;
    }
    const permissionState = resolvePhotoLibraryPermission(permission);
    if (permissionState !== "granted") {
      showMessage(
        getPhotoLibraryPermissionMessage(permissionState) ?? "사진 보관함 권한이 필요합니다.",
        "assertive",
      );
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
      showMessage("사진 선택을 취소했습니다.");
      return;
    }

    const asset = result.assets[0];
    const base64 = asset?.base64;
    if (!asset?.uri || !base64) {
      showMessage("선택한 사진을 읽지 못했습니다. 다른 사진으로 다시 시도해 주세요.", "assertive");
      return;
    }

    if (asset.type && asset.type !== "image") {
      showMessage(getGenerationUploadValidationMessage("unsupported_type"), "assertive");
      return;
    }

    // Expo ImagePicker returns the requested base64 field as JPEG image data.
    const mimeType = "image/jpeg";
    const uploadValidation = validateGenerationUploadMetadata({
      mimeType,
      byteSize: getBase64DecodedByteSize(base64),
      width: asset.width,
      height: asset.height,
    });
    if (!uploadValidation.ok) {
      showMessage(uploadValidation.messageKo, "assertive");
      return;
    }

    const dataUrl = `data:${mimeType};base64,${base64}`;
    flow.setImageDataUrl(dataUrl);
    flow.setDraft(null);
    flow.setDraftReceipt(null);
    setImageUri(asset.uri);
    setIsUploadingPortrait(true);
    showMessage("사진을 서버에 안전하게 업로드하고 있습니다. 이 단계가 끝날 때까지 앱을 유지해 주세요.");
    try {
      const clientRequestId = Crypto.randomUUID();
      const receipt = await api.prepareGenerationDraft({
        clientRequestId,
        referenceImageDataUrl: dataUrl,
      });
      flow.setDraftReceipt({
        draftId: receipt.draftId,
        clientRequestId: receipt.clientRequestId,
        uploadedAt: receipt.uploadedAt,
        expiresAt: receipt.expiresAt,
      });
      showMessage("사진 보안 업로드가 완료되었습니다. 이제 작은 생성 접수 명령만 남았습니다.");
    } catch (error) {
      showMessage(mapMobileUserError(
        error,
        "사진 보안 업로드에 실패했습니다. 사진을 확인하고 다시 시도해 주세요.",
        "photo",
      ), "assertive");
    } finally {
      setIsUploadingPortrait(false);
    }
  };

  const retryPortraitUpload = async () => {
    if (!flow.imageDataUrl || isUploadingPortrait) return;
    setIsUploadingPortrait(true);
    showMessage("사진 보안 업로드를 다시 시도하고 있습니다.");
    try {
      const clientRequestId = Crypto.randomUUID();
      const receipt = await api.prepareGenerationDraft({
        clientRequestId,
        referenceImageDataUrl: flow.imageDataUrl,
      });
      flow.setDraftReceipt({
        draftId: receipt.draftId,
        clientRequestId: receipt.clientRequestId,
        uploadedAt: receipt.uploadedAt,
        expiresAt: receipt.expiresAt,
      });
      showMessage("사진 보안 업로드가 완료되었습니다. 생성 접수를 시작할 수 있습니다.");
    } catch (error) {
      showMessage(mapMobileUserError(
        error,
        "사진 보안 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        "photo",
      ), "assertive");
    } finally {
      setIsUploadingPortrait(false);
    }
  };

  const previewSource = imageUri || flow.imageDataUrl;
  const hasUploadImage = Boolean(previewSource || flow.draftReceipt);

  return (
    <AppScreen>
      <Stack>
        <Kicker>사진 업로드</Kicker>
        <Heading>정면 사진 선택</Heading>
        <BodyText>사진을 먼저 비공개 저장소에 안전하게 업로드한 뒤 헤어스타일 생성 작업을 접수합니다.</BodyText>
        <BodyText>가로·세로 각각 512px 이상, 서버 전송 기준 8MB 이하의 사진을 선택해 주세요.</BodyText>
      </Stack>

      <Panel>
        <Stack>
          <View style={styles.preview}>
            {previewSource ? (
              <Image
                accessibilityLabel="헤어스타일 생성에 사용할 정면 얼굴 사진"
                accessibilityRole="image"
                source={{ uri: previewSource }}
                style={styles.image}
              />
            ) : <BodyText>선택한 사진이 없습니다</BodyText>}
          </View>
          <View
            accessibilityLabel={message}
            accessibilityLiveRegion={messageLiveRegion}
            accessibilityRole={messageLiveRegion === "assertive" ? "alert" : undefined}
          >
            <Card>
              <BodyText>{message}</BodyText>
            </Card>
          </View>
          <PhotoLibraryPermissionRecovery
            onOpenSettings={() => void handleOpenPermissionSettings()}
            visible={photoPermissionRequiresSettings}
          />
          {!isLoadingPersonalColor && !personalColor ? (
            <Card>
              <Stack>
                <Kicker>퍼스널컬러</Kicker>
                <Heading style={{ fontSize: 20, lineHeight: 26 }}>첫 퍼스널컬러 진단</Heading>
                <BodyText>
                  {hasUploadImage
                    ? "선택한 사진으로 웜·쿨 톤과 대비를 진단해 스타일링에 활용합니다."
                    : "아직 사진이 없다면 진단 화면에서 얼굴 사진을 선택할 수 있습니다."}
                </BodyText>
                <Button onPress={() => router.push("/personal-color?source=upload")}>
                  첫 진단 시작
                </Button>
              </Stack>
            </Card>
          ) : null}
          {imageUri && personalColor ? (
            <Card>
              <Stack>
                <Kicker>퍼스널컬러 저장됨</Kicker>
                <BodyText>
                  {personalColor.tone} 톤 · 대비 {personalColor.contrast}
                </BodyText>
                <BodyText>{personalColor.summary}</BodyText>
              </Stack>
            </Card>
          ) : null}
          <Button disabled={isUploadingPortrait} onPress={pickImage}>
            {isUploadingPortrait ? "사진 보안 업로드 중..." : "사진 선택"}
          </Button>
          {flow.imageDataUrl && !flow.draftReceipt && !isUploadingPortrait ? (
            <Button variant="secondary" onPress={retryPortraitUpload}>
              사진 업로드 다시 시도
            </Button>
          ) : null}
          <Button
            disabled={!flow.draftReceiptHydrated || !flow.draftReceipt || isUploadingPortrait}
            onPress={() => router.push("/generate")}
          >
            {flow.draftReceipt ? "접수 준비 완료 · 생성 단계로" : "사진 업로드 후 계속"}
          </Button>
          <Button disabled={isUploadingPortrait} variant="secondary" onPress={navigateBack}>
            이전 화면으로
          </Button>
        </Stack>
      </Panel>
    </AppScreen>
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
