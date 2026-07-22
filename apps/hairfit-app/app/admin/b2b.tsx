import { useAuth } from "@clerk/clerk-expo";
import type { AdminB2bLeadRow } from "@hairfit/api-client";
import { BodyText, Button, Card, Chip, Cluster, Heading, Stack, TextField } from "@hairfit/ui-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, View } from "react-native";
import { VirtualizedListScreen } from "../../components/app/VirtualizedListScreen";
import { AdminEmptyCard, AdminPageHeader, AdminSummaryGrid, AdminTabs } from "../../lib/admin-ui";
import { useHairfitApi } from "../../lib/api";

const stageFilters: { label: string; value: "" | AdminB2bLeadRow["stage"] }[] = [
  { label: "전체", value: "" },
  { label: "신규", value: "new" },
  { label: "검증", value: "qualified" },
  { label: "협상", value: "negotiation" },
  { label: "계약", value: "contracted" },
  { label: "드롭", value: "dropped" },
];

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}

function stageLabel(value: AdminB2bLeadRow["stage"]) {
  return stageFilters.find((stage) => stage.value === value)?.label ?? value;
}

function sourceLabel(value: AdminB2bLeadRow["source"]) {
  return value === "public_form" ? "웹 문의" : "관리자 등록";
}

function LeadCard({ lead }: { lead: AdminB2bLeadRow }) {
  return (
    <Card>
      <Stack gap={10}>
        <Cluster>
          <Chip tone={lead.stage === "contracted" ? "success" : lead.stage === "dropped" ? "danger" : "accent"}>
            {stageLabel(lead.stage)}
          </Chip>
          <Chip>{sourceLabel(lead.source)}</Chip>
          <Chip>{formatDate(lead.created_at)}</Chip>
        </Cluster>
        <Heading style={{ fontSize: 20, lineHeight: 26 }}>{lead.company_name}</Heading>
        <BodyText>{lead.contact_name} · {lead.email}</BodyText>
        <BodyText>{lead.phone || "전화번호 없음"}</BodyText>
        <BodyText>{lead.message}</BodyText>
        <Cluster>
          {lead.plan_interest ? <Chip>플랜 {lead.plan_interest}</Chip> : null}
          {lead.region ? <Chip>{lead.region}</Chip> : null}
          {lead.desired_timeline ? <Chip>{lead.desired_timeline}</Chip> : null}
        </Cluster>
        {lead.owner_note ? <BodyText>운영 메모: {lead.owner_note}</BodyText> : null}
      </Stack>
    </Card>
  );
}

export default function AdminB2bScreen() {
  const api = useHairfitApi();
  const { isLoaded, isSignedIn } = useAuth();
  const [leads, setLeads] = useState<AdminB2bLeadRow[]>([]);
  const [stageSummary, setStageSummary] = useState<{ stage: AdminB2bLeadRow["stage"]; count: number }[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [stage, setStage] = useState<"" | AdminB2bLeadRow["stage"]>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const load = useCallback(async (options: { append?: boolean; cursor?: string | null } = {}) => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setLeads([]);
      setTotal(0);
      setNextCursor(null);
      setError("관리자 계정으로 로그인해야 B2B 리드를 볼 수 있습니다.");
      return;
    }

    const sequence = ++requestSequence.current;
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.listAdminB2bLeads({
        q: appliedQuery || undefined,
        stage: stage || undefined,
        limit: 80,
        cursor: options.append ? options.cursor || undefined : undefined,
      });
      if (sequence !== requestSequence.current) return;
      setLeads((current) => (options.append ? [...current, ...result.leads] : result.leads));
      setStageSummary(result.stageSummary);
      if (!options.append) setTotal(result.total);
      setNextCursor(result.nextCursor ?? null);
    } catch {
      if (sequence !== requestSequence.current) return;
      if (!options.append) {
        setLeads([]);
        setStageSummary([]);
        setTotal(0);
        setNextCursor(null);
      }
      setError("B2B 리드를 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해주세요.");
    } finally {
      if (sequence === requestSequence.current) setIsLoading(false);
    }
  }, [api, appliedQuery, isLoaded, isSignedIn, stage]);

  useEffect(() => {
    void load();
  }, [load]);

  const countLabel = useMemo(
    () => `현재 ${leads.length.toLocaleString("ko-KR")} / 총 ${total.toLocaleString("ko-KR")}건`,
    [leads.length, total],
  );

  function submitSearch() {
    const normalizedQuery = query.trim();
    if (normalizedQuery === appliedQuery) {
      void load();
      return;
    }
    setAppliedQuery(normalizedQuery);
  }

  const listHeader = (
    <Stack>
      <AdminTabs activePath="/admin/b2b" />

      <AdminPageHeader
        title="B2B"
        countLabel={countLabel}
        description="앱에서는 도입 문의 단계와 운영 메모를 조회합니다. 단계·메모 변경은 웹 관리자에서 할 수 있습니다."
      >
        <Stack>
          <TextField value={query} onChangeText={setQuery} placeholder="회사명 / 담당자 / 이메일 검색" />
          <Cluster>
            {stageFilters.map((filter) => (
              <Button
                key={filter.value || "all"}
                variant={stage === filter.value ? "primary" : "secondary"}
                onPress={() => setStage(filter.value)}
              >
                {filter.label}
              </Button>
            ))}
          </Cluster>
          <Button variant="secondary" disabled={isLoading} onPress={submitSearch}>
            {isLoading ? "조회 중..." : "검색"}
          </Button>
        </Stack>
      </AdminPageHeader>

      <AdminSummaryGrid
        items={stageSummary.map((item) => ({ label: stageLabel(item.stage), value: item.count }))}
      />

      {error ? (
        <View accessibilityLiveRegion="assertive" accessibilityRole="alert">
          <Card>
            <Stack gap={10}>
              <BodyText>{error}</BodyText>
              <Button variant="secondary" disabled={isLoading} onPress={() => void load()}>
                다시 시도
              </Button>
            </Stack>
          </Card>
        </View>
      ) : null}
    </Stack>
  );

  return (
    <VirtualizedListScreen
        data={leads}
        keyExtractor={(lead) => lead.id}
        renderItem={({ item }) => <LeadCard lead={item} />}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListHeaderComponent={listHeader}
        ListHeaderComponentStyle={{ marginBottom: 16 }}
        ListEmptyComponent={!isLoading ? <AdminEmptyCard>조회된 리드가 없습니다.</AdminEmptyCard> : null}
        ListFooterComponent={nextCursor ? (
          <Button
            variant="secondary"
            disabled={isLoading}
            onPress={() => void load({ append: true, cursor: nextCursor })}
          >
            {isLoading ? "불러오는 중..." : "B2B 리드 더 보기"}
          </Button>
        ) : null}
        contentContainerStyle={{ gap: 0, padding: 8, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={isLoading && leads.length > 0} onRefresh={() => void load()} />}
    />
  );
}
