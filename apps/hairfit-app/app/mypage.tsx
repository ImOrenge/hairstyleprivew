import { useAuth } from "@clerk/clerk-expo";
import {
  parseAccountSetupContinuation,
  type MobileBootstrap,
  type MobileDashboard,
} from "@hairfit/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
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
import {
  CustomerBody,
  CustomerCard,
  CustomerHeading,
  CustomerKicker,
  CustomerScreen,
} from "../components/customer/CustomerPrimitives";

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
  const activeTab: MobileMyPageTabId =
    setupRequested || (me !== null && !me.accountSetupComplete)
      ? "account"
      : requestedTab;

  return (
    <CustomerScreen>
      <View style={{ gap: 10, paddingHorizontal: 4, paddingVertical: 8 }}>
        <CustomerKicker>My information</CustomerKicker>
        <CustomerHeading>내 정보</CustomerHeading>
        <CustomerBody>계정, 결제, 퍼스널컬러와 바디 프로필을 필요한 순간에 편하게 관리하세요. 기록은 스타일북, 관리 가이드는 케어에서 확인할 수 있어요.</CustomerBody>
      </View>

      <MobileMyPageTabNavigation
        activeTab={activeTab}
        onSelectTab={(tab) => router.push(getMobileMyPageTabHref(tab))}
      />

      {error && isSignedIn ? (
        <View accessibilityLiveRegion="assertive" accessibilityRole="alert">
          <CustomerCard><CustomerBody>{error}</CustomerBody></CustomerCard>
        </View>
      ) : null}

      {isLoading ? (
        <CustomerCard><CustomerBody>내 정보를 불러오는 중...</CustomerBody></CustomerCard>
      ) : null}

      {hasAccountSnapshot ? (
        <CustomerCard style={{ gap: 6 }}>
          <CustomerKicker>Membership</CustomerKicker>
          <CustomerHeading compact>{activePlan}</CustomerHeading>
          <CustomerBody>{credits.toLocaleString("ko-KR")} 크레딧 · 바디 프로필 {customer?.styleProfileReady ? "준비됨" : "설정 필요"}</CustomerBody>
        </CustomerCard>
      ) : null}

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
    </CustomerScreen>
  );
}
