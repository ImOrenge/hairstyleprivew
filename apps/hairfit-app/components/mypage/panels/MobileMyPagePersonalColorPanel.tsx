import type { StyleProfile } from "@hairfit/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { BodyText, Button, Card, Heading, Panel, Stack } from "@hairfit/ui-native";
import { PersonalColorResultDetails } from "../../PersonalColorResultDetails";
import { useHairfitApi } from "../../../lib/api";
import { mapMobileUserError } from "../../../lib/mobile-user-message";
import { MobileMyPageAsyncBoundary } from "../MobileMyPageAsyncBoundary";

export function MobileMyPagePersonalColorPanel() {
  const api = useHairfitApi();
  const router = useRouter();
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setIsLoadingProfile(true);
      try {
        const result = await api.getStyleProfile();
        if (!cancelled) {
          setProfile(result.profile);
          setMessage(null);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(mapMobileUserError(error, "퍼스널 컬러 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingProfile(false);
        }
      }
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const personalColor = profile?.personalColor ?? null;

  return (
    <MobileMyPageAsyncBoundary>
      <Panel>
      <Stack>
        <Heading style={styles.panelHeading}>퍼스널 컬러</Heading>
        <BodyText>추천 색상, 주의 색상, 컬러 조합과 스타일링 근거를 확인합니다.</BodyText>
        {isLoadingProfile ? <BodyText>퍼스널 컬러 결과를 불러오는 중입니다...</BodyText> : null}
        {message ? <BodyText>{message}</BodyText> : null}
        {!personalColor ? (
          <Card style={{ borderStyle: "dashed" }}>
            <Stack>
              <BodyText style={styles.centerStrong}>저장된 퍼스널 컬러 진단이 없습니다.</BodyText>
              <BodyText style={styles.centerText}>
                선명한 정면 얼굴 사진으로 진단하면 색상별 추천근거, 비추천근거, 컬러조합과 의미가 저장됩니다.
              </BodyText>
            </Stack>
          </Card>
        ) : (
          <PersonalColorResultDetails result={personalColor} />
        )}
        <Button onPress={() => router.push("/personal-color?source=mypage")}>
          {personalColor ? "퍼스널 컬러 다시 진단" : "퍼스널 컬러 진단"}
        </Button>
      </Stack>
      </Panel>
    </MobileMyPageAsyncBoundary>
  );
}

const styles = StyleSheet.create({
  centerStrong: {
    color: "#f4f1e8",
    fontWeight: "900",
    textAlign: "center",
  },
  centerText: {
    textAlign: "center",
  },
  panelHeading: {
    fontSize: 22,
    lineHeight: 28,
  },
});
