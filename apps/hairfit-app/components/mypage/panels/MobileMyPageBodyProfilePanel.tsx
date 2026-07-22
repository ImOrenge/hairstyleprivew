import type { StyleProfile } from "@hairfit/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import {
  BodyText,
  Button,
  Card,
  Heading,
  Kicker,
  Panel,
  Stack,
} from "@hairfit/ui-native";
import { useHairfitApi } from "../../../lib/api";
import { mapMobileUserError } from "../../../lib/mobile-user-message";
import { formatMobilePersonalColor as formatPersonalColor } from "../../../lib/mypage";
import { MobileMyPageAsyncBoundary } from "../MobileMyPageAsyncBoundary";

export function MobileMyPageBodyProfilePanel() {
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
          setMessage(mapMobileUserError(error, "바디프로필을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
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
        <Heading style={styles.panelHeading}>바디프로필 설정</Heading>
        <BodyText>저장된 체형 정보와 참고 사진은 패션 추천에 사용됩니다.</BodyText>
        {isLoadingProfile ? <BodyText>바디 프로필을 불러오는 중입니다...</BodyText> : null}
        {message ? <BodyText>{message}</BodyText> : null}
        <Card>
          <Stack>
            <Kicker>퍼스널컬러</Kicker>
            <Heading style={{ fontSize: 20, lineHeight: 26 }}>{formatPersonalColor(personalColor)}</Heading>
            <BodyText>
              {personalColor?.summary || "선명한 얼굴 사진을 업로드해 스타일링에 사용할 퍼스널 컬러 정보를 저장하세요."}
            </BodyText>
            <Button onPress={() => router.push("/mypage?tab=personal-color")}>
              퍼스널컬러 탭 보기
            </Button>
          </Stack>
        </Card>
      </Stack>
      </Panel>
    </MobileMyPageAsyncBoundary>
  );
}

const styles = StyleSheet.create({
  panelHeading: {
    fontSize: 22,
    lineHeight: 28,
  },
});
