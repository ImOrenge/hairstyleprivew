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
import { useEffect, useMemo, useState } from "react";
import { View, type DimensionValue } from "react-native";
import { useHairfitApi } from "../../lib/api";
import { AdminTabs } from "../../lib/admin-ui";

type RangeDays = 7 | 30 | 90;

const rangeOptions: RangeDays[] = [7, 30, 90];

function formatKrw(value: number) {
  return value.toLocaleString("ko-KR");
}

export default function AdminStatsScreen() {
  const router = useRouter();
  const api = useHairfitApi();
  const { isLoaded, isSignedIn } = useAuth();
  const [dashboard, setDashboard] = useState<Extract<MobileDashboard, { service: "admin" }> | null>(null);
  const [range, setRange] = useState<RangeDays>(30);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isLoaded) return;
      if (!isSignedIn) {
        setDashboard(null);
        setError("관리자 계정으로 로그인하면 운영 지표를 확인할 수 있습니다.");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const result = await api.getMobileDashboard("admin", { range });
        if (!cancelled && result.service === "admin") {
          setDashboard(result);
        }
      } catch (loadError) {
        if (!cancelled) {
          setDashboard(null);
          setError(loadError instanceof Error ? loadError.message : "통계 데이터를 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, isLoaded, isSignedIn, range]);

  const kpis = dashboard?.admin.kpis;
  const daily = dashboard?.admin.daily ?? [];
  const maxDaily = useMemo(() => {
    if (!daily.length) return 1;
    return Math.max(
      1,
      ...daily.map((row) =>
        Math.max(row.newUsers, row.generationsCompleted, row.reviews, row.b2bLeads, row.paidOrders),
      ),
    );
  }, [daily]);

  return (
    <Screen>
      <AdminTabs activePath="/admin/stats" />

      <Panel>
        <Stack>
          <Kicker>Admin Dashboard</Kicker>
          <Heading>통계</Heading>
          <BodyText>운영 지표를 최근 기간 기준으로 집계합니다.</BodyText>
          <Cluster>
            {rangeOptions.map((option) => (
              <Button
                key={option}
                variant={option === range ? "primary" : "secondary"}
                onPress={() => {
                  if (option === range) return;
                  setRange(option);
                }}
              >
                최근 {option}일
              </Button>
            ))}
          </Cluster>
        </Stack>
      </Panel>

      {isLoading ? (
        <Panel>
          <BodyText>불러오는 중...</BodyText>
        </Panel>
      ) : null}

      {!isLoading ? (
        <>
          <MetricGrid>
            <MetricTile label="신규 회원" value={kpis?.newUsers ?? 0} />
            <MetricTile label="유료 결제" value={kpis?.paidOrders ?? 0} />
            <MetricTile label="매출 (KRW)" value={formatKrw(kpis?.revenueKrw ?? 0)} />
            <MetricTile label="완료 생성" value={kpis?.generationsCompleted ?? 0} />
            <MetricTile label="리뷰 작성" value={kpis?.reviewsSubmitted ?? 0} />
            <MetricTile label="숨김 리뷰" value={kpis?.hiddenReviews ?? 0} />
          </MetricGrid>

          {error ? (
            <Card>
              <Stack gap={12}>
                <BodyText>{error}</BodyText>
                <Button variant="secondary" onPress={() => router.push("/")}>
                  홈으로 돌아가기
                </Button>
              </Stack>
            </Card>
          ) : null}

          <Panel>
            <Stack>
              <BodyText>B2B 리드</BodyText>
              <Heading>{kpis?.b2bLeads ?? 0}</Heading>
              <MetricGrid>
                {(dashboard?.admin.leadStages ?? []).map((stage) => (
                  <MetricTile key={stage.stage} label={stage.stage} value={stage.count} />
                ))}
              </MetricGrid>
            </Stack>
          </Panel>

          <Panel>
            <Stack>
              <Heading>일별 추이</Heading>
              {daily.length ? (
                daily.map((day) => {
                  const maxForRow = Math.max(
                    day.newUsers,
                    day.generationsCompleted,
                    day.reviews,
                    day.b2bLeads,
                    day.paidOrders,
                  );
                  const width = `${Math.max(2, (maxForRow / maxDaily) * 100)}%` as DimensionValue;

                  return (
                    <Card key={day.date}>
                      <Stack gap={10}>
                        <Cluster>
                          <Chip>{day.date}</Chip>
                        </Cluster>
                        <BodyText>
                          회원 {day.newUsers} · 생성 {day.generationsCompleted} · 리뷰 {day.reviews} · B2B {day.b2bLeads}
                        </BodyText>
                        <View style={{ backgroundColor: "#34322c", borderRadius: 999, height: 8 }}>
                          <View style={{ backgroundColor: "#f4f1e8", borderRadius: 999, height: 8, width }} />
                        </View>
                        <BodyText>
                          결제 {day.paidOrders}건 / 매출 {formatKrw(day.revenueKrw)}원
                        </BodyText>
                      </Stack>
                    </Card>
                  );
                })
              ) : (
                <Card>
                  <BodyText>표시할 일별 지표가 없습니다.</BodyText>
                </Card>
              )}
            </Stack>
          </Panel>
        </>
      ) : null}
    </Screen>
  );
}
