import { useAuth } from "@clerk/clerk-expo";
import type { MobileDashboard } from "@hairfit/shared";
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
  TextField,
} from "@hairfit/ui-native";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { useHairfitApi } from "../../../lib/api";

const emptySummary = {
  totalCustomers: 0,
  linkedMembers: 0,
  pendingAftercare: 0,
  dueToday: 0,
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  });
}

function sourceLabel(customer: { email: string | null }) {
  return customer.email ? "회원 연결" : "수기 등록";
}

export default function SalonCustomersScreen() {
  const router = useRouter();
  const api = useHairfitApi();
  const { isLoaded, isSignedIn } = useAuth();
  const [dashboard, setDashboard] = useState<Extract<MobileDashboard, { service: "salon" }> | null>(null);
  const [isAdminReadOnly, setIsAdminReadOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"all" | "manual" | "linked_member">("all");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isLoaded) return;
      if (!isSignedIn) {
        setDashboard(null);
        setError("살롱 오너 계정으로 로그인하면 CRM을 확인할 수 있습니다.");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const [me, result] = await Promise.all([api.getMobileMe(), api.getMobileDashboard("salon")]);
        if (!cancelled && result.service === "salon") {
          setIsAdminReadOnly(me.accountType === "admin");
          setDashboard(result);
        }
      } catch (loadError) {
        if (!cancelled) {
          setDashboard(null);
          setError(loadError instanceof Error ? loadError.message : "고객 목록을 불러오지 못했습니다.");
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

  const summary = dashboard?.salon.summary ?? emptySummary;
  const customers = dashboard?.salon.recentCustomers ?? [];
  const filteredCustomers = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return customers.filter((customer) => {
      const customerSource = customer.email ? "linked_member" : "manual";
      const sourceMatches = source === "all" || source === customerSource;
      const queryMatches =
        !needle ||
        [customer.name, customer.phone, customer.email].some((value) => value?.toLowerCase().includes(needle));

      return sourceMatches && queryMatches;
    });
  }, [customers, query, source]);

  return (
    <Screen>
      <Stack gap={14} style={{ padding: 16 }}>
        <Kicker>Salon CRM</Kicker>
        <Heading>고객관리</Heading>
        <MetricGrid>
          <MetricTile label="전체 고객" value={summary.totalCustomers} />
          <MetricTile label="회원 연결" value={summary.linkedMembers} />
          <MetricTile label="사후관리 대기" value={summary.pendingAftercare} />
          <MetricTile label="오늘까지" value={summary.dueToday} />
        </MetricGrid>
      </Stack>

      <Divider />

      {isAdminReadOnly ? (
        <Card style={{ backgroundColor: "#2e2507", borderColor: "#facc15" }}>
          <BodyText style={{ color: "#facc15", fontWeight: "800" }}>
            Admin read-only mode: select a target from Admin members to make changes.
          </BodyText>
        </Card>
      ) : null}

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

      <Stack gap={10}>
        <TextField value={query} onChangeText={setQuery} placeholder="이름, 전화번호, 이메일 검색" />
        <Cluster gap={8}>
          <Button variant={source === "all" ? "primary" : "secondary"} onPress={() => setSource("all")}>
            전체 유입
          </Button>
          <Button variant={source === "manual" ? "primary" : "secondary"} onPress={() => setSource("manual")}>
            수기 등록
          </Button>
          <Button
            variant={source === "linked_member" ? "primary" : "secondary"}
            onPress={() => setSource("linked_member")}
          >
            회원 연결
          </Button>
        </Cluster>
      </Stack>

      <Panel>
        <Stack>
          {isLoading ? <BodyText style={{ textAlign: "center" }}>불러오는 중...</BodyText> : null}

          {!isLoading && !error && filteredCustomers.length === 0 ? (
            <BodyText style={{ textAlign: "center" }}>등록된 고객이 없습니다.</BodyText>
          ) : null}

          {filteredCustomers.map((customer) => (
            <Card key={customer.id}>
              <Stack gap={10}>
                <Cluster>
                  <Chip tone={customer.email ? "success" : "neutral"}>{sourceLabel(customer)}</Chip>
                  <Chip>최근 업데이트 {formatDate(customer.updatedAt)}</Chip>
                </Cluster>
                <Heading style={{ fontSize: 20, lineHeight: 26 }}>{customer.name}</Heading>
                <BodyText>{customer.phone || customer.email || "연락처 없음"}</BodyText>
                <BodyText>사후관리 {formatDate(customer.nextFollowUpAt)}</BodyText>
                <Button variant="secondary">열기</Button>
              </Stack>
            </Card>
          ))}
        </Stack>
      </Panel>

      <Panel>
        <Stack>
          <Heading style={{ fontSize: 18, lineHeight: 24 }}>회원 매칭 초대</Heading>
          <BodyText>회원이 동의한 뒤에만 CRM 후보로 보이도록 초대 링크를 발급합니다.</BodyText>
          <Button disabled>초대 링크 만들기</Button>
        </Stack>
      </Panel>

      <Panel>
        <Stack>
          <Heading style={{ fontSize: 18, lineHeight: 24 }}>매칭 후보</Heading>
          <TextField placeholder="회원 이름, 이메일 검색" />
          <Card>
            <BodyText style={{ textAlign: "center" }}>대기 중인 매칭 후보가 없습니다.</BodyText>
          </Card>
        </Stack>
      </Panel>

      <Panel>
        <Stack>
          <Heading style={{ fontSize: 18, lineHeight: 24 }}>고객 등록</Heading>
          <TextField placeholder="고객 이름" />
          <TextField placeholder="전화번호" />
          <TextField placeholder="이메일" />
          <TextField placeholder="메모" />
          <Button disabled>고객 등록</Button>
        </Stack>
      </Panel>

      <Panel>
        <Stack>
          <Heading style={{ fontSize: 18, lineHeight: 24 }}>다가오는 사후관리</Heading>
          <BodyText>대기 중인 사후관리가 없습니다.</BodyText>
        </Stack>
      </Panel>
    </Screen>
  );
}
