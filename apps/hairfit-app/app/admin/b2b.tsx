import { useAuth } from "@clerk/clerk-expo";
import type { AdminB2bLeadRow } from "@hairfit/api-client";
import { BodyText, Button, Card, Chip, Cluster, Heading, Screen, Stack, TextField } from "@hairfit/ui-native";
import { useEffect, useMemo, useState } from "react";
import { AdminEmptyCard, AdminPageHeader, AdminSummaryGrid, AdminTabs } from "../../lib/admin-ui";
import { useHairfitApi } from "../../lib/api";

const stageFilters: Array<{ label: string; value: "" | AdminB2bLeadRow["stage"] }> = [
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

function LeadCard({ lead }: { lead: AdminB2bLeadRow }) {
  return (
    <Card>
      <Stack gap={10}>
        <Cluster>
          <Chip tone={lead.stage === "contracted" ? "success" : lead.stage === "dropped" ? "danger" : "accent"}>
            {stageLabel(lead.stage)}
          </Chip>
          <Chip>{lead.source}</Chip>
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
  const [stageSummary, setStageSummary] = useState<Array<{ stage: AdminB2bLeadRow["stage"]; count: number }>>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<"" | AdminB2bLeadRow["stage"]>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setLeads([]);
      setTotal(0);
      setError("관리자 계정으로 로그인해야 B2B 리드를 볼 수 있습니다.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await api.listAdminB2bLeads({
        q: query.trim() || undefined,
        stage: stage || undefined,
        limit: 80,
      });
      setLeads(result.leads);
      setStageSummary(result.stageSummary);
      setTotal(result.total);
    } catch (loadError) {
      setLeads([]);
      setStageSummary([]);
      setTotal(0);
      setError(loadError instanceof Error ? loadError.message : "B2B 리드를 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [api, isLoaded, isSignedIn, stage]);

  const countLabel = useMemo(() => `총 ${total.toLocaleString("ko-KR")}건`, [total]);

  return (
    <Screen>
      <AdminTabs activePath="/admin/b2b" />

      <AdminPageHeader
        title="B2B"
        countLabel={countLabel}
        description="도입 문의 리드의 단계와 운영 메모를 Next.js 관리자와 같은 API로 확인합니다."
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
          <Button variant="secondary" disabled={isLoading} onPress={load}>
            {isLoading ? "조회 중..." : "검색"}
          </Button>
        </Stack>
      </AdminPageHeader>

      <AdminSummaryGrid
        items={stageSummary.map((item) => ({ label: stageLabel(item.stage), value: item.count }))}
      />

      {error ? (
        <Card>
          <BodyText>{error}</BodyText>
        </Card>
      ) : null}

      <Stack>
        {isLoading ? <AdminEmptyCard>B2B 리드를 불러오는 중입니다.</AdminEmptyCard> : null}
        {!isLoading && leads.length === 0 ? <AdminEmptyCard>조회된 리드가 없습니다.</AdminEmptyCard> : null}
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} />
        ))}
      </Stack>
    </Screen>
  );
}
