import { useAuth } from "@clerk/clerk-expo";
import type { MobileDashboard } from "@hairfit/shared";
import {
  BodyText,
  Button,
  Card,
  Chip,
  Cluster,
  Heading,
  Kicker,
  MetricGrid,
  MetricTile,
  Panel,
  Screen,
  Stack,
} from "@hairfit/ui-native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useHairfitApi } from "../../lib/api";

function formatKrw(value: number) {
  return value.toLocaleString("ko-KR");
}

export default function AdminHomeScreen() {
  const router = useRouter();
  const api = useHairfitApi();
  const { isLoaded, isSignedIn } = useAuth();
  const [dashboard, setDashboard] = useState<Extract<MobileDashboard, { service: "admin" }> | null>(null);
  const [message, setMessage] = useState("운영 대시보드를 불러오는 중입니다.");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isLoaded) return;
      if (!isSignedIn) {
        setMessage("관리자 계정으로 로그인하면 운영 데이터를 확인할 수 있습니다.");
        return;
      }

      try {
        const result = await api.getMobileDashboard("admin");
        if (!cancelled && result.service === "admin") {
          setDashboard(result);
          setMessage("관리자 모바일 요약이 동기화되었습니다.");
        }
      } catch (error) {
        if (!cancelled) {
          setDashboard(null);
          setMessage(error instanceof Error ? error.message : "관리자 대시보드를 불러오지 못했습니다.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, isLoaded, isSignedIn]);

  const kpis = dashboard?.admin.kpis;

  return (
    <Screen>
      <Panel>
        <Stack>
          <Kicker>HairFit Admin</Kicker>
          <Heading>운영 대시보드</Heading>
          <BodyText>{message}</BodyText>
          <Cluster>
            <Chip tone="accent">통계</Chip>
            <Chip>회원</Chip>
            <Chip>B2B</Chip>
            <Chip>리뷰</Chip>
          </Cluster>
          <Cluster>
            <Button onPress={() => router.push("/admin/stats")}>통계 열기</Button>
            <Button variant="secondary" onPress={() => router.push("/")}>
              홈으로
            </Button>
          </Cluster>
        </Stack>
      </Panel>

      <MetricGrid>
        <MetricTile label="신규 회원" value={kpis?.newUsers ?? 0} helper="최근 30일" />
        <MetricTile label="유료 결제" value={kpis?.paidOrders ?? 0} helper="결제 완료" />
        <MetricTile label="매출 (KRW)" value={formatKrw(kpis?.revenueKrw ?? 0)} helper="결제 기준" />
        <MetricTile label="완료 생성" value={kpis?.generationsCompleted ?? 0} helper="생성 완료" />
      </MetricGrid>

      <Panel>
        <Stack>
          <Kicker>Admin Dashboard</Kicker>
          <Heading>관리 작업</Heading>
          <Card>
            <Stack gap={10}>
              <BodyText>통계, 회원, B2B 리드, 리뷰를 모바일에서도 같은 순서로 확인하도록 정리했습니다.</BodyText>
              <Button variant="secondary" onPress={() => router.push("/admin/stats")}>
                최근 30일 통계 보기
              </Button>
            </Stack>
          </Card>
        </Stack>
      </Panel>
    </Screen>
  );
}
