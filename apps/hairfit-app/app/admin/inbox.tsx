import { useAuth } from "@clerk/clerk-expo";
import type { AdminInboundEmailRow } from "@hairfit/api-client";
import { BodyText, Button, Card, Chip, Cluster, Heading, Screen, Stack, TextField } from "@hairfit/ui-native";
import { useEffect, useMemo, useState } from "react";
import { AdminEmptyCard, AdminPageHeader, AdminSummaryGrid, AdminTabs } from "../../lib/admin-ui";
import { useHairfitApi } from "../../lib/api";

const statusFilters = [
  { label: "전체", value: "" },
  { label: "신규", value: "new" },
  { label: "읽음", value: "read" },
  { label: "보관", value: "archived" },
] as const;

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function statusLabel(value: AdminInboundEmailRow["status"]) {
  if (value === "new") return "신규";
  if (value === "read") return "읽음";
  return "보관";
}

function EmailCard({ email }: { email: AdminInboundEmailRow }) {
  return (
    <Card>
      <Stack gap={10}>
        <Cluster>
          <Chip tone={email.status === "new" ? "accent" : "neutral"}>{statusLabel(email.status)}</Chip>
          <Chip>{email.mailbox}</Chip>
          <Chip>{formatDate(email.received_at)}</Chip>
        </Cluster>
        <Heading style={{ fontSize: 20, lineHeight: 26 }}>{email.subject || "제목 없음"}</Heading>
        <BodyText>{email.header_from || email.envelope_from}</BodyText>
        <BodyText>{email.body_preview || "미리보기 없음"}</BodyText>
        {email.attachments.length ? <BodyText>첨부 {email.attachments.length}개</BodyText> : null}
      </Stack>
    </Card>
  );
}

export default function AdminInboxScreen() {
  const api = useHairfitApi();
  const { isLoaded, isSignedIn } = useAuth();
  const [emails, setEmails] = useState<AdminInboundEmailRow[]>([]);
  const [statusSummary, setStatusSummary] = useState<Array<{ status: AdminInboundEmailRow["status"]; count: number }>>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | AdminInboundEmailRow["status"]>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setEmails([]);
      setTotal(0);
      setError("관리자 계정으로 로그인해야 메일함을 볼 수 있습니다.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await api.listAdminInboundEmails({
        q: query.trim() || undefined,
        status: status || undefined,
        limit: 80,
      });
      setEmails(result.emails);
      setStatusSummary(result.statusSummary);
      setTotal(result.total);
    } catch (loadError) {
      setEmails([]);
      setTotal(0);
      setStatusSummary([]);
      setError(loadError instanceof Error ? loadError.message : "메일 목록을 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [api, isLoaded, isSignedIn, status]);

  const countLabel = useMemo(() => `총 ${total.toLocaleString("ko-KR")}건`, [total]);

  return (
    <Screen>
      <AdminTabs activePath="/admin/inbox" />

      <AdminPageHeader
        kicker="관리자 메일함"
        title="수신 메일"
        countLabel={countLabel}
        description="Cloudflare Email Routing으로 들어온 문의를 Next.js 관리자 메일함과 같은 API로 확인합니다."
      >
        <Stack>
          <TextField value={query} onChangeText={setQuery} placeholder="보낸 사람 / 받는 사람 / 제목 / 미리보기 검색" />
          <Cluster>
            {statusFilters.map((filter) => (
              <Button
                key={filter.value || "all"}
                variant={status === filter.value ? "primary" : "secondary"}
                onPress={() => setStatus(filter.value)}
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
        items={statusSummary.map((item) => ({ label: statusLabel(item.status), value: item.count }))}
      />

      {error ? (
        <Card>
          <BodyText>{error}</BodyText>
        </Card>
      ) : null}

      <Stack>
        {isLoading ? <AdminEmptyCard>메일을 불러오는 중입니다.</AdminEmptyCard> : null}
        {!isLoading && emails.length === 0 ? <AdminEmptyCard>조회된 메일이 없습니다.</AdminEmptyCard> : null}
        {emails.map((email) => (
          <EmailCard key={email.id} email={email} />
        ))}
      </Stack>
    </Screen>
  );
}
