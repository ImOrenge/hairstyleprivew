import { useAuth } from "@clerk/clerk-expo";
import type { SalonAftercareTask, SalonCustomer } from "@hairfit/api-client";
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
import { useEffect, useState } from "react";
import { useHairfitApi } from "../../../lib/api";

const sourceFilters: Array<{ label: string; value: "" | "manual" | "linked_member" }> = [
  { label: "전체", value: "" },
  { label: "수기 등록", value: "manual" },
  { label: "회원 연결", value: "linked_member" },
];

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
  return date.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}

function sourceLabel(customer: SalonCustomer) {
  return customer.isLinkedMember ? "회원 연결" : "수기 등록";
}

function CustomerCard({ customer }: { customer: SalonCustomer }) {
  const router = useRouter();

  return (
    <Card>
      <Stack gap={10}>
        <Cluster>
          <Chip tone={customer.isLinkedMember ? "success" : "neutral"}>{sourceLabel(customer)}</Chip>
          <Chip>최근 수정 {formatDate(customer.updatedAt)}</Chip>
          {customer.styleTarget ? <Chip>{customer.styleTarget === "male" ? "남성" : "여성"}</Chip> : null}
        </Cluster>
        <Heading style={{ fontSize: 20, lineHeight: 26 }}>{customer.name}</Heading>
        <BodyText>{customer.phone || customer.email || "연락처 없음"}</BodyText>
        {customer.memo ? <BodyText>{customer.memo}</BodyText> : null}
        <BodyText>다음 애프터케어 {formatDate(customer.nextFollowUpAt)}</BodyText>
        <Button variant="secondary" onPress={() => router.push(`/salon/customers/${encodeURIComponent(customer.id)}`)}>
          상세 열기
        </Button>
      </Stack>
    </Card>
  );
}

function AftercareTaskCard({ task }: { task: SalonAftercareTask }) {
  return (
    <Card>
      <Stack gap={8}>
        <Cluster>
          <Chip tone={task.status === "pending" ? "accent" : "neutral"}>{task.status}</Chip>
          <Chip>{task.channel}</Chip>
          <Chip>{formatDate(task.scheduledFor)}</Chip>
        </Cluster>
        <BodyText>{task.note || "메모 없음"}</BodyText>
      </Stack>
    </Card>
  );
}

export default function SalonCustomersScreen() {
  const router = useRouter();
  const api = useHairfitApi();
  const { isLoaded, isSignedIn } = useAuth();
  const [customers, setCustomers] = useState<SalonCustomer[]>([]);
  const [pendingAftercare, setPendingAftercare] = useState<SalonAftercareTask[]>([]);
  const [summary, setSummary] = useState(emptySummary);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"" | "manual" | "linked_member">("");

  const load = async () => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setCustomers([]);
      setPendingAftercare([]);
      setSummary(emptySummary);
      setError("살롱 오너 계정으로 로그인하면 CRM을 확인할 수 있습니다.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await api.listSalonCustomers({
        q: query.trim() || undefined,
        source: source || undefined,
      });
      setCustomers(result.customers);
      setPendingAftercare(result.pendingAftercare);
      setSummary(result.summary);
    } catch (loadError) {
      setCustomers([]);
      setPendingAftercare([]);
      setSummary(emptySummary);
      setError(loadError instanceof Error ? loadError.message : "고객 목록을 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [api, isLoaded, isSignedIn, source]);

  return (
    <Screen>
      <Stack gap={14} style={{ padding: 16 }}>
        <Kicker>Salon CRM</Kicker>
        <Heading>고객관리</Heading>
        <MetricGrid>
          <MetricTile label="전체 고객" value={summary.totalCustomers} />
          <MetricTile label="회원 연결" value={summary.linkedMembers} />
          <MetricTile label="애프터케어 대기" value={summary.pendingAftercare} />
          <MetricTile label="오늘까지" value={summary.dueToday} />
        </MetricGrid>
      </Stack>

      <Divider />

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
          {sourceFilters.map((filter) => (
            <Button
              key={filter.value || "all"}
              variant={source === filter.value ? "primary" : "secondary"}
              onPress={() => setSource(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </Cluster>
        <Button variant="secondary" disabled={isLoading} onPress={load}>
          {isLoading ? "조회 중..." : "검색"}
        </Button>
      </Stack>

      <Panel>
        <Stack>
          <Heading style={{ fontSize: 20, lineHeight: 26 }}>고객 목록</Heading>
          {isLoading ? <BodyText style={{ textAlign: "center" }}>불러오는 중...</BodyText> : null}
          {!isLoading && customers.length === 0 ? (
            <BodyText style={{ textAlign: "center" }}>등록된 고객이 없습니다.</BodyText>
          ) : null}
          {customers.map((customer) => (
            <CustomerCard key={customer.id} customer={customer} />
          ))}
        </Stack>
      </Panel>

      <Panel>
        <Stack>
          <Heading style={{ fontSize: 20, lineHeight: 26 }}>다가오는 애프터케어</Heading>
          {pendingAftercare.length === 0 ? <BodyText>대기 중인 애프터케어가 없습니다.</BodyText> : null}
          {pendingAftercare.map((task) => (
            <AftercareTaskCard key={task.id} task={task} />
          ))}
        </Stack>
      </Panel>
    </Screen>
  );
}
