import { useAuth, useClerk } from "@clerk/clerk-expo";
import type { MobileBootstrap, MobileServiceKey } from "@hairfit/shared";
import {
  BodyText,
  Button,
  Card,
  Chip,
  Cluster,
  Divider,
  Heading,
  Kicker,
  MetricGrid,
  MetricTile,
  Panel,
  Screen,
  Stack,
} from "@hairfit/ui-native";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { useHairfitApi } from "../lib/api";

const serviceLabels: Record<MobileServiceKey, { title: string; description: string }> = {
  customer: {
    title: "고객 서비스",
    description: "사진 업로드, 헤어 추천, 스타일러, 결제와 마이페이지를 이용합니다.",
  },
  salon: {
    title: "살롱 CRM",
    description: "고객 목록, 매칭, 방문 기록과 애프터케어 업무를 확인합니다.",
  },
  admin: {
    title: "운영 관리",
    description: "통계, 회원, 리뷰, B2B 리드와 운영 데이터를 확인합니다.",
  },
};

const customerActions = [
  { label: "사진 업로드", helper: "헤어 추천 시작", route: "/upload" },
  { label: "패션 코디", helper: "스타일러 열기", route: "/styler/new" },
  { label: "애프터케어", helper: "시술 기록 관리", route: "/aftercare" },
  { label: "마이페이지", helper: "크레딧과 결과", route: "/mypage" },
] as const;

function servicesForBootstrap(bootstrap: MobileBootstrap | null) {
  return bootstrap?.services.length ? bootstrap.services : (["customer"] as MobileServiceKey[]);
}

export default function HairfitHomeScreen() {
  const router = useRouter();
  const api = useHairfitApi();
  const { signOut } = useClerk();
  const { isLoaded, isSignedIn } = useAuth();
  const [bootstrap, setBootstrap] = useState<MobileBootstrap | null>(null);
  const [message, setMessage] = useState("세션을 확인하는 중입니다.");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isLoaded) return;
      if (!isSignedIn) {
        setBootstrap(null);
        setMessage("로그인하면 계정 권한에 맞는 HairFit 모바일 화면을 사용할 수 있습니다.");
        return;
      }

      try {
        const next = await api.getMobileMe();
        if (!cancelled) {
          setBootstrap(next);
          setMessage(
            next.onboardingComplete
              ? "사용 가능한 서비스를 선택하세요."
              : "온보딩을 완료하면 추천 플로우를 시작할 수 있습니다.",
          );
        }
      } catch (error) {
        if (!cancelled) {
          setBootstrap(null);
          setMessage(error instanceof Error ? error.message : "모바일 계정 정보를 불러오지 못했습니다.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, isLoaded, isSignedIn]);

  const services = useMemo(() => servicesForBootstrap(bootstrap), [bootstrap]);
  const displayName = bootstrap?.displayName || bootstrap?.email || "Guest";
  const accountType = bootstrap?.accountType ?? "guest";

  function openCustomerHome() {
    if (!isSignedIn) {
      router.push("/login");
      return;
    }
    if (bootstrap && !bootstrap.onboardingComplete) {
      router.push("/onboarding");
      return;
    }
    router.push("/mypage");
  }

  function openService(service: MobileServiceKey) {
    if (!isSignedIn) {
      router.push("/login");
      return;
    }
    if (service === "customer") {
      openCustomerHome();
      return;
    }
    if (service === "salon") {
      router.push("/salon/customers");
      return;
    }
    router.push("/admin");
  }

  return (
    <Screen>
      <Panel>
        <Stack>
          <Cluster>
            <Chip tone={isSignedIn ? "success" : "accent"}>{isSignedIn ? "Signed in" : "Guest"}</Chip>
            <Chip>{accountType}</Chip>
          </Cluster>
          <Kicker>HairFit App</Kicker>
          <Heading>하나의 앱에서 HairFit을 운영합니다</Heading>
          <BodyText>{message}</BodyText>
          {!isSignedIn ? (
            <Cluster>
              <Button onPress={() => router.push("/login")}>로그인</Button>
              <Button variant="secondary" onPress={() => router.push("/signup")}>
                회원가입
              </Button>
            </Cluster>
          ) : (
            <Cluster>
              <Button onPress={openCustomerHome}>내 HairFit 열기</Button>
              <Button variant="ghost" onPress={() => void signOut()}>
                로그아웃
              </Button>
            </Cluster>
          )}
        </Stack>
      </Panel>

      {bootstrap ? (
        <MetricGrid>
          <MetricTile label="크레딧" value={bootstrap.credits.toLocaleString("ko-KR")} helper="사용 가능" />
          <MetricTile label="플랜" value={bootstrap.planKey || "free"} helper="현재 구독" />
        </MetricGrid>
      ) : null}

      <Panel>
        <Stack>
          <Kicker>Services</Kicker>
          <Heading>권한별 진입</Heading>
          <BodyText>계정에 허용된 역할만 열 수 있습니다. 권한이 없는 화면은 서버에서 한번 더 차단됩니다.</BodyText>
          {services.map((service) => {
            const label = serviceLabels[service];
            return (
              <Card key={service}>
                <Stack gap={10}>
                  <Cluster>
                    <Chip tone={service === "customer" ? "accent" : service === "salon" ? "success" : "neutral"}>
                      {service}
                    </Chip>
                  </Cluster>
                  <Heading>{label.title}</Heading>
                  <BodyText>{label.description}</BodyText>
                  <Button variant="secondary" onPress={() => openService(service)}>
                    열기
                  </Button>
                </Stack>
              </Card>
            );
          })}
        </Stack>
      </Panel>

      <Panel>
        <Stack>
          <Kicker>Customer Flow</Kicker>
          <Heading>고객 모바일 UI</Heading>
          <BodyText>Next.js 모바일 UI의 핵심 고객 플로우를 같은 native 앱 안에서 유지합니다.</BodyText>
          <Divider />
          <MetricGrid>
            {customerActions.map((action) => (
              <MetricTile key={action.route} label={action.label} value=">" helper={action.helper} />
            ))}
          </MetricGrid>
          <Cluster>
            {customerActions.map((action) => (
              <Button key={action.route} variant="secondary" onPress={() => router.push(action.route)}>
                {action.label}
              </Button>
            ))}
          </Cluster>
        </Stack>
      </Panel>
    </Screen>
  );
}
