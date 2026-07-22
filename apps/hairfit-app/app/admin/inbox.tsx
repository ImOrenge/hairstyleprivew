import { useAuth } from "@clerk/clerk-expo";
import type { AdminInboundEmailRow } from "@hairfit/api-client";
import { BodyText, Button, Card, Chip, Cluster, Heading, Stack, TextField } from "@hairfit/ui-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, View } from "react-native";
import { VirtualizedListScreen } from "../../components/app/VirtualizedListScreen";
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

function mailboxLabel(value: AdminInboundEmailRow["mailbox"]) {
  if (value === "support") return "지원";
  if (value === "business") return "비즈니스";
  return "일반";
}

function EmailCard({ email }: { email: AdminInboundEmailRow }) {
  return (
    <Card>
      <Stack gap={10}>
        <Cluster>
          <Chip tone={email.status === "new" ? "accent" : "neutral"}>{statusLabel(email.status)}</Chip>
          <Chip>{mailboxLabel(email.mailbox)}</Chip>
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
  const [statusSummary, setStatusSummary] = useState<{ status: AdminInboundEmailRow["status"]; count: number }[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [status, setStatus] = useState<"" | AdminInboundEmailRow["status"]>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const load = useCallback(async (options: { append?: boolean; cursor?: string | null } = {}) => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setEmails([]);
      setTotal(0);
      setNextCursor(null);
      setError("관리자 계정으로 로그인해야 메일함을 볼 수 있습니다.");
      return;
    }

    const sequence = ++requestSequence.current;
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.listAdminInboundEmails({
        q: appliedQuery || undefined,
        status: status || undefined,
        limit: 80,
        cursor: options.append ? options.cursor || undefined : undefined,
      });
      if (sequence !== requestSequence.current) return;
      setEmails((current) => (options.append ? [...current, ...result.emails] : result.emails));
      setStatusSummary(result.statusSummary);
      if (!options.append) setTotal(result.total);
      setNextCursor(result.nextCursor ?? null);
    } catch {
      if (sequence !== requestSequence.current) return;
      if (!options.append) {
        setEmails([]);
        setTotal(0);
        setStatusSummary([]);
        setNextCursor(null);
      }
      setError("메일 목록을 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해주세요.");
    } finally {
      if (sequence === requestSequence.current) setIsLoading(false);
    }
  }, [api, appliedQuery, isLoaded, isSignedIn, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const countLabel = useMemo(
    () => `현재 ${emails.length.toLocaleString("ko-KR")} / 총 ${total.toLocaleString("ko-KR")}건`,
    [emails.length, total],
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
      <AdminTabs activePath="/admin/inbox" />

      <AdminPageHeader
        kicker="관리자 메일함"
        title="수신 메일"
        countLabel={countLabel}
        description="앱에서는 수신 문의를 조회합니다. 읽음·보관 처리와 관리자 메모 변경은 웹 관리자에서 할 수 있습니다."
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
          <Button variant="secondary" disabled={isLoading} onPress={submitSearch}>
            {isLoading ? "조회 중..." : "검색"}
          </Button>
        </Stack>
      </AdminPageHeader>

      <AdminSummaryGrid
        items={statusSummary.map((item) => ({ label: statusLabel(item.status), value: item.count }))}
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
        data={emails}
        keyExtractor={(email) => email.id}
        renderItem={({ item }) => <EmailCard email={item} />}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListHeaderComponent={listHeader}
        ListHeaderComponentStyle={{ marginBottom: 16 }}
        ListEmptyComponent={!isLoading ? <AdminEmptyCard>조회된 메일이 없습니다.</AdminEmptyCard> : null}
        ListFooterComponent={nextCursor ? (
          <Button
            variant="secondary"
            disabled={isLoading}
            onPress={() => void load({ append: true, cursor: nextCursor })}
          >
            {isLoading ? "불러오는 중..." : "수신 메일 더 보기"}
          </Button>
        ) : null}
        contentContainerStyle={{ gap: 0, padding: 8, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={isLoading && emails.length > 0} onRefresh={() => void load()} />}
    />
  );
}
