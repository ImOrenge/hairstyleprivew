import { useAuth, useUser } from "@clerk/clerk-expo";
import type { MobileBootstrap } from "@hairfit/shared";
import { BodyText, Button, Card, Heading, Kicker, Panel, Stack } from "@hairfit/ui-native";
import { type Href, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { AppScreen } from "../components/app/AppScreen";
import { MobileAccountDeletionPanel } from "../components/mypage/MobileAccountDeletionPanel";
import { useHairfitApi } from "../lib/api";
import { signOutAndClearAuthResume } from "../lib/auth-resume";
import { usePushNotifications } from "../components/app/PushNotificationProvider";
import { mapMobileUserError } from "../lib/mobile-user-message";
import { formatMobileAccountSetup, formatMobileAccountType, formatMobileMyPagePlanLabel } from "../lib/mypage";
import {
  getRoleHomeRoute,
  getRoleNavigationLabel,
  normalizeAccountType,
  readAccountTypeMetadata,
  resolveRoleNavigationRole,
} from "../lib/role-navigation";

export default function AccountScreen() {
  const api = useHairfitApi();
  const pushNotifications = usePushNotifications();
  const router = useRouter();
  const { isLoaded, isSignedIn, sessionClaims, signOut, userId } = useAuth();
  const { user } = useUser();
  const [me, setMe] = useState<MobileBootstrap | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [signOutPending, setSignOutPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isLoaded) return;
      if (!isSignedIn) {
        setMe(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const next = await api.getMobileMe();
        if (!cancelled) setMe(next);
      } catch (loadError) {
        if (!cancelled) {
          setMe(null);
          setError(mapMobileUserError(loadError, "계정 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, isLoaded, isSignedIn, userId]);

  const metadataAccountType =
    normalizeAccountType(user?.publicMetadata?.accountType) ?? readAccountTypeMetadata(sessionClaims);
  const role = resolveRoleNavigationRole(me?.accountType ?? metadataAccountType, "/account");
  const roleLabel = getRoleNavigationLabel(role);
  const email =
    me?.email ?? user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? "-";
  const displayName = me?.displayName?.trim() || user?.fullName?.trim() || user?.firstName?.trim() || "HairFit 사용자";

  const handleSignOut = async () => {
    if (signOutPending) return;
    setSignOutPending(true);
    setError(null);

    try {
      if (
        pushNotifications.status === "enabled" ||
        Boolean(pushNotifications.installationId)
      ) {
        const revoked = await pushNotifications.disable("logout");
        if (!revoked) {
          setError("이 기기의 완료 알림 연결을 해제하지 못해 로그아웃을 중단했습니다. 잠시 후 다시 시도해 주세요.");
          return;
        }
      }
      await signOutAndClearAuthResume(signOut);
      router.replace("/login");
    } catch (signOutError) {
      setError(mapMobileUserError(signOutError, "로그아웃에 실패했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      setSignOutPending(false);
    }
  };

  if (!isLoaded) {
    return (
      <AppScreen>
        <Card>
          <BodyText>로그인 세션을 확인하는 중...</BodyText>
        </Card>
      </AppScreen>
    );
  }

  if (!isSignedIn) {
    return (
      <AppScreen>
        <Panel>
          <Stack>
            <Kicker>계정</Kicker>
            <Heading>로그인이 필요합니다</Heading>
            <BodyText>계정 정보와 로그아웃 설정을 확인하려면 먼저 로그인해 주세요.</BodyText>
            <Button onPress={() => router.replace("/login")}>로그인</Button>
          </Stack>
        </Panel>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <Panel>
        <Stack>
          <Kicker>{roleLabel} Account</Kicker>
          <Heading>계정</Heading>
          <BodyText>현재 로그인된 계정과 역할을 확인하고 안전하게 로그아웃할 수 있습니다.</BodyText>
        </Stack>
      </Panel>

      {isLoading ? (
        <Card>
          <BodyText>계정 정보를 불러오는 중...</BodyText>
        </Card>
      ) : null}

      {!isLoading ? (
        <Card>
          <Stack gap={12}>
            <Stack gap={4}>
              <BodyText>이름</BodyText>
              <Heading>{displayName}</Heading>
            </Stack>
            <Stack gap={4}>
              <BodyText>이메일</BodyText>
              <BodyText>{email}</BodyText>
            </Stack>
            <Stack gap={4}>
              <BodyText>계정 유형</BodyText>
              <BodyText>{formatMobileAccountType(me?.accountType ?? metadataAccountType)}</BodyText>
            </Stack>
            {me ? (
              <>
                <Stack gap={4}>
                  <BodyText>계정 설정</BodyText>
                  <BodyText>{formatMobileAccountSetup(me.accountSetupComplete)}</BodyText>
                </Stack>
                <Stack gap={4}>
                  <BodyText>플랜 · 크레딧</BodyText>
                  <BodyText>
                    {formatMobileMyPagePlanLabel(me.planKey)} · {me.credits.toLocaleString("ko-KR")}크레딧
                  </BodyText>
                </Stack>
              </>
            ) : null}
          </Stack>
        </Card>
      ) : null}

      <Panel>
        <Stack>
          <Kicker>생성 완료 알림</Kicker>
          <Heading>
            {pushNotifications.status === "enabled" ? "앱 알림 사용 중" : "이 기기에서 알림 받기"}
          </Heading>
          <BodyText>
            헤어스타일 생성 접수 후 앱을 닫아도 완료·부분 완료·실패 결과를 알려드립니다.
            알림을 사용하지 않아도 이메일과 앱 내 작업 현황은 계속 제공됩니다.
          </BodyText>
          {pushNotifications.message ? (
            <View
              accessibilityLiveRegion={pushNotifications.status === "error" ? "assertive" : "polite"}
              accessibilityRole={pushNotifications.status === "error" ? "alert" : undefined}
            >
              <BodyText>{pushNotifications.message}</BodyText>
            </View>
          ) : null}
          {pushNotifications.status === "enabled" ? (
            <Button
              variant="secondary"
              onPress={() => void pushNotifications.disable()}
            >
              이 기기 알림 끄기
            </Button>
          ) : (
            <Button
              loading={pushNotifications.status === "registering"}
              loadingLabel="알림 연결 중..."
              onPress={() => void pushNotifications.enable()}
            >
              완료 알림 켜기
            </Button>
          )}
          {pushNotifications.status === "denied" ? (
            <Button
              variant="secondary"
              onPress={() => void pushNotifications.openSettings()}
            >
              기기 설정에서 권한 열기
            </Button>
          ) : null}
        </Stack>
      </Panel>

      {error ? (
        <View accessibilityLiveRegion="assertive" accessibilityRole="alert">
          <Card>
            <BodyText>{error}</BodyText>
          </Card>
        </View>
      ) : null}

      <Panel>
        <Stack>
          <Button onPress={() => router.replace(getRoleHomeRoute(role) as Href)}>
            {role === "customer" ? "홈으로" : `${roleLabel} 화면으로`}
          </Button>
          {role === "customer" ? (
            <Button variant="secondary" onPress={() => router.push("/mypage?tab=account")}>
              프로필 상세 설정
            </Button>
          ) : null}
          <Button
            loading={signOutPending}
            loadingLabel="로그아웃 중..."
            variant="secondary"
            onPress={handleSignOut}
          >
            로그아웃
          </Button>
        </Stack>
      </Panel>

      <MobileAccountDeletionPanel />
    </AppScreen>
  );
}
