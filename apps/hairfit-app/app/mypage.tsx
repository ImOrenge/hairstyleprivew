import { useAuth } from "@clerk/clerk-expo";
import type { MobileBootstrap, MobileDashboard } from "@hairfit/shared";
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { useHairfitApi } from "../lib/api";

type MyPageTabId = "usage" | "plan" | "aftercare" | "body-profile" | "account";

const tabIds: MyPageTabId[] = ["usage", "plan", "aftercare", "body-profile", "account"];

const tabs: Array<{ id: MyPageTabId; label: string; description: string }> = [
  { id: "usage", label: "사용기록", description: "최근 생성 기록" },
  { id: "plan", label: "플랜/결제", description: "구독과 결제" },
  { id: "aftercare", label: "애프터케어", description: "시술 기록" },
  { id: "body-profile", label: "바디프로필", description: "패션 추천 설정" },
  { id: "account", label: "계정", description: "기본 정보" },
];

function normalizeTab(value: unknown): MyPageTabId {
  const first = Array.isArray(value) ? value[0] : value;
  return tabIds.includes(first as MyPageTabId) ? (first as MyPageTabId) : "usage";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatKrw(value: number) {
  return `${value.toLocaleString("ko-KR")} KRW`;
}

function formatPlanLabel(planKey: string | null | undefined) {
  if (!planKey) return "무료";
  if (planKey === "starter") return "스타터";
  if (planKey === "pro") return "프로";
  return planKey.charAt(0).toUpperCase() + planKey.slice(1);
}

function statusLabel(value: string | null | undefined) {
  const status = value?.toLowerCase();
  if (status === "completed") return "완료";
  if (status === "failed" || status === "error") return "실패";
  if (status === "processing" || status === "running") return "생성 중";
  if (status === "queued" || status === "pending") return "대기 중";
  return value || "상태 확인 중";
}

function displayName(me: MobileBootstrap | null) {
  const name = me?.displayName?.trim();
  if (name) return name;
  const emailName = me?.email?.split("@")[0]?.trim();
  return emailName || "HairFit 사용자";
}

function TabNavigation({ activeTab }: { activeTab: MyPageTabId }) {
  const router = useRouter();

  return (
    <Panel style={{ padding: 8 }}>
      <Cluster gap={8}>
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? "primary" : "secondary"}
            onPress={() => router.push(`/mypage?tab=${tab.id}`)}
          >
            {tab.label}
          </Button>
        ))}
      </Cluster>
    </Panel>
  );
}

function UsagePanel({
  generations,
}: {
  generations: Extract<MobileDashboard, { service: "customer" }>["customer"]["recentGenerations"];
}) {
  const router = useRouter();

  return (
    <Panel>
      <Stack>
        <Heading style={{ fontSize: 22, lineHeight: 28 }}>최근 사용기록</Heading>
        <BodyText>최근 헤어 생성 기록과 현재 처리 상태입니다.</BodyText>
        {generations.length === 0 ? (
          <Card style={{ borderStyle: "dashed", paddingVertical: 28 }}>
            <Stack gap={8}>
              <BodyText style={{ color: "#f4f1e8", fontWeight: "900", textAlign: "center" }}>
                아직 생성 기록이 없습니다.
              </BodyText>
              <BodyText style={{ textAlign: "center" }}>
                워크스페이스에서 첫 보드를 만들면 여기에 표시됩니다.
              </BodyText>
            </Stack>
          </Card>
        ) : (
          generations.map((item) => (
            <Card key={item.id}>
              <Stack gap={10}>
                <Cluster>
                  <Chip tone={item.status === "completed" ? "success" : "neutral"}>{statusLabel(item.status)}</Chip>
                  <Chip>{formatDate(item.createdAt)}</Chip>
                </Cluster>
                <BodyText style={{ color: "#f4f1e8", fontWeight: "700" }}>
                  {item.promptUsed || "제목 없는 생성 결과"}
                </BodyText>
                <BodyText>{item.id}</BodyText>
                <Button variant="secondary" onPress={() => router.push(`/result/${item.id}`)}>
                  열기
                </Button>
              </Stack>
            </Card>
          ))
        )}
      </Stack>
    </Panel>
  );
}

function PlanPanel({
  activePlan,
  payments,
}: {
  activePlan: string;
  payments: Extract<MobileDashboard, { service: "customer" }>["customer"]["recentPayments"];
}) {
  return (
    <Panel>
      <Stack>
        <Heading style={{ fontSize: 22, lineHeight: 28 }}>플랜 및 결제</Heading>
        <BodyText>현재 플랜과 최근 결제 내역입니다.</BodyText>
        <Card>
          <BodyText>활성 플랜</BodyText>
          <Heading>{activePlan}</Heading>
        </Card>
        {payments.length === 0 ? (
          <Card style={{ borderStyle: "dashed" }}>
            <BodyText>결제 기록이 없습니다.</BodyText>
          </Card>
        ) : (
          payments.map((payment) => (
            <Card key={payment.id}>
              <BodyText style={{ color: "#f4f1e8", fontWeight: "800" }}>{formatKrw(payment.amountKrw)}</BodyText>
              <BodyText>
                {payment.status} / {payment.creditsToGrant.toLocaleString("ko-KR")} 크레딧
              </BodyText>
              <BodyText>{formatDate(payment.paidAt ?? payment.createdAt)}</BodyText>
            </Card>
          ))
        )}
      </Stack>
    </Panel>
  );
}

function AftercarePanel() {
  return (
    <Panel>
      <Stack>
        <Heading style={{ fontSize: 22, lineHeight: 28 }}>애프터케어</Heading>
        <BodyText>최근 확정한 헤어 시술 기록입니다.</BodyText>
        <Card style={{ borderStyle: "dashed" }}>
          <BodyText>아직 애프터케어 기록이 없습니다.</BodyText>
        </Card>
      </Stack>
    </Panel>
  );
}

function BodyProfilePanel() {
  return (
    <Panel>
      <Stack>
        <Heading style={{ fontSize: 22, lineHeight: 28 }}>바디프로필 설정</Heading>
        <BodyText>저장된 체형 정보와 참고 사진을 패션 추천에 사용합니다.</BodyText>
        <Card>
          <BodyText>아래 프로필을 완성하세요.</BodyText>
        </Card>
      </Stack>
    </Panel>
  );
}

function AccountPanel({ me }: { me: MobileBootstrap | null }) {
  return (
    <Panel>
      <Stack>
        <Heading style={{ fontSize: 22, lineHeight: 28 }}>계정</Heading>
        <BodyText>로그인된 고객 계정의 기본 정보입니다.</BodyText>
        <Card>
          <BodyText style={{ color: "#f4f1e8", fontWeight: "900" }}>{displayName(me)}</BodyText>
          <BodyText>{me?.email || "-"}</BodyText>
        </Card>
      </Stack>
    </Panel>
  );
}

export default function MyPageScreen() {
  const api = useHairfitApi();
  const router = useRouter();
  const searchParams = useLocalSearchParams();
  const activeTab = normalizeTab(searchParams.tab);
  const { isLoaded, isSignedIn } = useAuth();
  const [dashboard, setDashboard] = useState<Extract<MobileDashboard, { service: "customer" }> | null>(null);
  const [me, setMe] = useState<MobileBootstrap | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isLoaded) return;
      if (!isSignedIn) {
        setDashboard(null);
        setError("로그인하면 사용기록, 플랜, 애프터케어를 확인할 수 있습니다.");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const [mobileMe, result] = await Promise.all([api.getMobileMe(), api.getMobileDashboard("customer")]);
        if (!cancelled && result.service === "customer") {
          setMe(mobileMe);
          setDashboard(result);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "대시보드를 불러오지 못했습니다.");
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
  }, [api, isLoaded, isSignedIn]);

  const customer = dashboard?.customer;
  const credits = customer?.credits ?? me?.credits ?? 0;
  const activePlan = formatPlanLabel(customer?.planKey ?? me?.planKey);
  const estimatedStyles = Math.floor(credits / 5);
  const usedCredits = 0;
  const viewerName = displayName(me);

  const activePanel = useMemo(() => {
    if (activeTab === "plan") {
      return <PlanPanel activePlan={activePlan} payments={customer?.recentPayments ?? []} />;
    }
    if (activeTab === "aftercare") return <AftercarePanel />;
    if (activeTab === "body-profile") return <BodyProfilePanel />;
    if (activeTab === "account") return <AccountPanel me={me} />;
    return <UsagePanel generations={customer?.recentGenerations ?? []} />;
  }, [activePlan, activeTab, customer?.recentGenerations, customer?.recentPayments, me]);

  return (
    <Screen>
      <Panel>
        <Stack>
          <Kicker>My Page</Kicker>
          <Heading>계정 대시보드</Heading>
          <BodyText>
            {viewerName}님의 사용기록, 플랜, 사용량, 애프터케어, 바디프로필 설정을 탭으로 확인하세요.
          </BodyText>
          <Button variant="secondary" onPress={() => router.push("/workspace")}>
            워크스페이스 열기 →
          </Button>
        </Stack>
      </Panel>

      {error && isSignedIn ? (
        <Card>
          <BodyText>{error}</BodyText>
        </Card>
      ) : null}

      {isLoading ? (
        <Card>
          <BodyText>불러오는 중...</BodyText>
        </Card>
      ) : null}

      <MetricGrid>
        <MetricTile label="크레딧" value={credits.toLocaleString("ko-KR")} helper={`헤어 생성 약 ${estimatedStyles}회 가능`} />
        <MetricTile label="플랜" value={activePlan} helper="활성 구독 정보 없음" />
        <MetricTile label="사용량" value={usedCredits.toLocaleString("ko-KR")} helper="최근 생성 기록에서 사용한 크레딧" />
        <MetricTile label="바디프로필" value="필요" helper="아래 프로필을 완성하세요" />
      </MetricGrid>

      <TabNavigation activeTab={activeTab} />
      <Divider />
      {activePanel}
    </Screen>
  );
}
