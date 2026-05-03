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

export default function SalonHomeScreen() {
  const router = useRouter();
  const api = useHairfitApi();
  const { isLoaded, isSignedIn } = useAuth();
  const [dashboard, setDashboard] = useState<Extract<MobileDashboard, { service: "salon" }> | null>(null);
  const [message, setMessage] = useState("살롱 대시보드를 불러오는 중입니다.");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isLoaded) return;
      if (!isSignedIn) {
        setMessage("살롱 오너 계정으로 로그인하면 CRM 데이터를 확인할 수 있습니다.");
        return;
      }

      try {
        const result = await api.getMobileDashboard("salon");
        if (!cancelled && result.service === "salon") {
          setDashboard(result);
          setMessage("살롱 CRM 요약이 동기화되었습니다.");
        }
      } catch (error) {
        if (!cancelled) {
          setDashboard(null);
          setMessage(error instanceof Error ? error.message : "살롱 대시보드를 불러오지 못했습니다.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, isLoaded, isSignedIn]);

  const summary = dashboard?.salon.summary;

  return (
    <Screen>
      <Panel>
        <Stack>
          <Kicker>HairFit Salon</Kicker>
          <Heading>살롱 CRM</Heading>
          <BodyText>{message}</BodyText>
          <Cluster>
            <Chip tone="accent">고객</Chip>
            <Chip>매칭</Chip>
            <Chip>방문</Chip>
            <Chip>애프터케어</Chip>
          </Cluster>
          <Cluster>
            <Button onPress={() => router.push("/salon/customers")}>고객 관리 열기</Button>
            <Button variant="secondary" onPress={() => router.push("/")}>
              홈으로
            </Button>
          </Cluster>
        </Stack>
      </Panel>

      {summary ? (
        <MetricGrid>
          <MetricTile label="전체 고객" value={summary.totalCustomers} helper="CRM 등록 고객" />
          <MetricTile label="회원 연결" value={summary.linkedMembers} helper="HairFit 회원 매칭" />
          <MetricTile label="애프터케어 대기" value={summary.pendingAftercare} helper="안내 필요" />
          <MetricTile label="오늘까지" value={summary.dueToday} helper="처리 예정" />
        </MetricGrid>
      ) : (
        <Card>
          <BodyText>권한 확인 후 살롱 데이터가 표시됩니다.</BodyText>
        </Card>
      )}
    </Screen>
  );
}
