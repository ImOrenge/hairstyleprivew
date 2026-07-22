import { useAuth } from "@clerk/clerk-expo";
import {
  parseAccountSetupContinuation,
  estimateHairstyleGenerations,
  HAIRSTYLE_GENERATION_CREDITS,
  type MobileBootstrap,
  type MobileDashboard,
} from "@hairfit/shared";
import {
  BodyText,
  Button,
  Card,
  Divider,
  MetricGrid,
  MetricTile,
} from "@hairfit/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { AppScreen } from "../components/app/AppScreen";
import { MobileMyPageActivePanel } from "../components/mypage/MobileMyPageActivePanel";
import { MobileMyPageTabNavigation } from "../components/mypage/MobileMyPageTabNavigation";
import { useHairfitApi } from "../lib/api";
import { mapMobileUserError } from "../lib/mobile-user-message";
import {
  formatMobileMyPagePlanLabel,
  getMobileMyPageTabHref,
  normalizeMobileMyPageTab,
  type MobileCustomerDashboard,
  type MobileMyPageTabId,
} from "../lib/mypage";

export default function MyPageScreen() {
  const api = useHairfitApi();
  const router = useRouter();
  const searchParams = useLocalSearchParams();
  const requestedTab = normalizeMobileMyPageTab(searchParams.tab);
  const setupParam = Array.isArray(searchParams.setup)
    ? searchParams.setup[0]
    : searchParams.setup;
  const setupRequested = setupParam === "1" || setupParam === "true";
  const accountSetupContinuation = parseAccountSetupContinuation(searchParams.continue);
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [dashboard, setDashboard] = useState<MobileCustomerDashboard | null>(
    null,
  );
  const [me, setMe] = useState<MobileBootstrap | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isLoaded) return;
      if (!isSignedIn) {
        setDashboard(null);
        setMe(null);
        setError(
          "로그인하면 사용기록, 플랜, 에프터케어, 바디프로필 설정을 확인할 수 있습니다.",
        );
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      setDashboard(null);
      setMe(null);
      const [meResult, dashboardResult] = await Promise.allSettled([
        api.getMobileMe(),
        api.getMobileDashboard("customer"),
      ]);
      if (cancelled) return;

      setMe(meResult.status === "fulfilled" ? meResult.value : null);
      setDashboard(
        dashboardResult.status === "fulfilled" &&
          dashboardResult.value.service === "customer"
          ? (dashboardResult.value as Extract<
              MobileDashboard,
              { service: "customer" }
            >)
          : null,
      );
      const failures = [meResult, dashboardResult]
        .filter(
          (result): result is PromiseRejectedResult =>
            result.status === "rejected",
        )
        .map((result) => mapMobileUserError(result.reason, "계정 정보를 불러오지 못했습니다."));
      if (failures.length > 0) {
        setError(
          `일부 계정 정보를 불러오지 못했습니다. ${failures.join(" / ")}`,
        );
      }
      setIsLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, isLoaded, isSignedIn, userId]);

  const customer = dashboard?.customer;
  const hasAccountSnapshot = Boolean(customer || me);
  const credits = customer?.credits ?? me?.credits ?? 0;
  const activePlan = formatMobileMyPagePlanLabel(
    customer?.planKey ?? me?.planKey,
  );
  const hairstyleGenerationCredits =
    customer?.creditPolicy?.hairstyleGeneration ??
    HAIRSTYLE_GENERATION_CREDITS;
  const estimatedStyles = estimateHairstyleGenerations(
    credits,
    hairstyleGenerationCredits,
  );
  const usedCredits = 0;
  const activeTab: MobileMyPageTabId =
    setupRequested || (me !== null && !me.accountSetupComplete)
      ? "account"
      : requestedTab;

  return (
    <AppScreen
      footerOverlay={
        <Button
          disabled={Boolean(me && !me.accountSetupComplete)}
          onPress={() => router.push("/workspace")}
        >
          {me && !me.accountSetupComplete ? "계정 설정 저장 후 생성 가능" : "헤어스타일 생성"}
        </Button>
      }
    >
      <MobileMyPageTabNavigation
        activeTab={activeTab}
        onSelectTab={(tab) => router.push(getMobileMyPageTabHref(tab))}
      />

      {error && isSignedIn ? (
        <View accessibilityLiveRegion="assertive" accessibilityRole="alert">
          <Card>
            <BodyText>{error}</BodyText>
          </Card>
        </View>
      ) : null}

      {isLoading ? (
        <Card>
          <BodyText>불러오는 중...</BodyText>
        </Card>
      ) : null}

      {hasAccountSnapshot ? (
        <MetricGrid>
          <MetricTile
            label="크레딧"
            value={credits.toLocaleString("ko-KR")}
            helper={`헤어 1회 ${hairstyleGenerationCredits}크레딧 · 약 ${estimatedStyles.toLocaleString("ko-KR")}회 가능`}
          />
          <MetricTile
            label="플랜"
            value={activePlan}
            helper="활성 구독 정보 없음"
          />
          <MetricTile
            label="사용량"
            value={usedCredits.toLocaleString("ko-KR")}
            helper="최근 생성 기록에서 사용한 크레딧"
          />
          <MetricTile
            label="바디프로필"
            value={customer?.styleProfileReady ? "준비됨" : "필요"}
            helper="아래 프로필을 완성하세요"
          />
        </MetricGrid>
      ) : null}

      <Divider />
      {hasAccountSnapshot || activeTab === "account" ? (
        <MobileMyPageActivePanel
          accountSetupContinuation={accountSetupContinuation}
          activePlan={activePlan}
          activeTab={activeTab}
          credits={credits}
          customer={customer}
          me={me}
          onAccountSaved={setMe}
        />
      ) : null}
    </AppScreen>
  );
}
