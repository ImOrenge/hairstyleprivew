import {
  GOOGLE_PLAY_STORE_URL,
  evaluateMobileAppUpdate,
  type MobileAppVersionStatus,
} from "@hairfit/shared";
import { BodyText, Button, Card, Heading, Kicker, spacing, useThemeColors } from "@hairfit/ui-native/primitives";
import * as Application from "expo-application";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { AppState, Linking, Modal, Platform, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getHairfitApiBaseUrl } from "../../lib/api";
import { googlePlayMarketUrl, parseMobileAppVersionStatus } from "../../lib/app-version";
import { useNetworkRecovery } from "./NetworkRecoveryProvider";

interface UpdateNotice {
  status: MobileAppVersionStatus;
  required: boolean;
}

export function AppVersionProvider({ children }: { children: ReactNode }) {
  const theme = useThemeColors();
  const { availability, recoveryToken } = useNetworkRecovery();
  const [notice, setNotice] = useState<UpdateNotice | null>(null);
  const [dismissedVersionCode, setDismissedVersionCode] = useState<number | null>(null);
  const [openingStore, setOpeningStore] = useState(false);

  const checkForUpdate = useCallback(async () => {
    if (Platform.OS !== "android" || availability === "offline") return;
    const installedVersionCode = Application.nativeBuildVersion;
    if (!installedVersionCode) return;

    try {
      const response = await fetch(`${getHairfitApiBaseUrl()}/api/mobile/app-version`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return;
      const status = parseMobileAppVersionStatus(await response.json());
      if (!status) return;

      const decision = evaluateMobileAppUpdate(installedVersionCode, status);
      setNotice(decision.available ? { status, required: decision.required } : null);
    } catch {
      // Version checks must never prevent the app from starting.
    }
  }, [availability]);

  useEffect(() => {
    void checkForUpdate();
  }, [checkForUpdate, recoveryToken]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void checkForUpdate();
    });
    return () => subscription.remove();
  }, [checkForUpdate]);

  const openPlayStore = useCallback(async () => {
    setOpeningStore(true);
    try {
      await Linking.openURL(googlePlayMarketUrl());
    } catch {
      await Linking.openURL(GOOGLE_PLAY_STORE_URL).catch(() => undefined);
    } finally {
      setOpeningStore(false);
    }
  }, []);

  const visible = Boolean(
    notice && (notice.required || dismissedVersionCode !== notice.status.latestVersionCode),
  );

  return (
    <>
      {children}
      <Modal
        animationType="fade"
        onRequestClose={() => {
          if (notice && !notice.required) setDismissedVersionCode(notice.status.latestVersionCode);
        }}
        transparent
        visible={visible}
      >
        <SafeAreaView style={styles.overlay}>
          <Card style={{ ...styles.card, shadowColor: theme.text }}>
            <View accessibilityRole="alert" accessibilityViewIsModal style={styles.content}>
              <Kicker>{notice?.required ? "필수 업데이트" : "새 버전 안내"}</Kicker>
              <Heading style={styles.heading}>새로운 HairFit을 만나보세요</Heading>
              <BodyText>
                {notice?.status.latestVersionName
                  ? `Google Play에 HairFit ${notice.status.latestVersionName} 버전이 출시되었습니다.`
                  : "Google Play에 새로운 HairFit 버전이 출시되었습니다."}
              </BodyText>
              {notice?.required ? (
                <BodyText>안정적인 서비스 이용을 위해 업데이트 후 계속할 수 있습니다.</BodyText>
              ) : null}
              <View style={styles.actions}>
                <Button
                  accessibilityHint="Google Play의 HairFit 앱 페이지를 엽니다"
                  loading={openingStore}
                  loadingLabel="스토어 여는 중"
                  onPress={() => void openPlayStore()}
                >
                  지금 업데이트
                </Button>
                {notice && !notice.required ? (
                  <Button
                    onPress={() => setDismissedVersionCode(notice.status.latestVersionCode)}
                    variant="ghost"
                  >
                    나중에
                  </Button>
                ) : null}
              </View>
            </View>
          </Card>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    maxWidth: 440,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.28,
    shadowRadius: 28,
    width: "100%",
  },
  content: {
    gap: spacing.md,
  },
  heading: {
    fontSize: 26,
    lineHeight: 32,
  },
  actions: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
});
