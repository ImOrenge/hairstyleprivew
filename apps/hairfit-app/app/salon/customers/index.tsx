import { useAuth } from "@clerk/clerk-expo";
import {
  LatestRequestGuard,
  type SalonAftercareTask,
  type SalonCustomer,
  type SalonMatchCandidate,
} from "@hairfit/api-client";
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
  Stack,
  TextField,
} from "@hairfit/ui-native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, View } from "react-native";
import { VirtualizedListScreen } from "../../../components/app/VirtualizedListScreen";
import { useHairfitApi } from "../../../lib/api";

const sourceFilters: { label: string; value: "" | "manual" | "linked_member" }[] = [
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

function MatchCandidateCard({
  candidate,
  isLinking,
  onLink,
}: {
  candidate: SalonMatchCandidate;
  isLinking: boolean;
  onLink: () => void;
}) {
  return (
    <Card>
      <Stack gap={10}>
        <Cluster>
          <Chip tone="success">공유 동의 완료</Chip>
          <Chip>CRM 연결 대기</Chip>
        </Cluster>
        <Heading style={{ fontSize: 19, lineHeight: 25 }}>{candidate.member.displayName}</Heading>
        <BodyText>{candidate.member.email || "이메일 없음"}</BodyText>
        <Button disabled={isLinking} onPress={onLink}>
          {isLinking ? "연결 중..." : "CRM 고객으로 연결"}
        </Button>
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
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"" | "manual" | "linked_member">("");
  const requestSequence = useRef(0);
  const [matchQuery, setMatchQuery] = useState("");
  const [appliedMatchQuery, setAppliedMatchQuery] = useState("");
  const [matchCandidates, setMatchCandidates] = useState<SalonMatchCandidate[]>([]);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [isMatchLoading, setIsMatchLoading] = useState(true);
  const [linkingRequestId, setLinkingRequestId] = useState<string | null>(null);
  const [matchCurrentCursor, setMatchCurrentCursor] = useState<string | null>(null);
  const [matchNextCursor, setMatchNextCursor] = useState<string | null>(null);
  const [matchCursorHistory, setMatchCursorHistory] = useState<(string | null)[]>([]);
  const matchRequestGuard = useRef(new LatestRequestGuard());

  const load = useCallback(async (options: { append?: boolean } = {}) => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setCustomers([]);
      setPendingAftercare([]);
      setSummary(emptySummary);
      setNextCursor(null);
      setError("살롱 오너 계정으로 로그인하면 CRM을 확인할 수 있습니다.");
      setIsLoading(false);
      return;
    }

    const sequence = ++requestSequence.current;
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.listSalonCustomers({
        q: query.trim() || undefined,
        source: source || undefined,
        limit: 50,
        cursor: options.append ? nextCursor || undefined : undefined,
      });
      if (sequence !== requestSequence.current) return;
      setCustomers((current) => (options.append ? [...current, ...result.customers] : result.customers));
      setPendingAftercare(result.pendingAftercare);
      if (!options.append) setSummary(result.summary);
      setNextCursor(result.nextCursor);
    } catch {
      if (sequence !== requestSequence.current) return;
      if (!options.append) {
        setCustomers([]);
        setPendingAftercare([]);
        setSummary(emptySummary);
        setNextCursor(null);
      }
      setError("고객 목록을 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      if (sequence === requestSequence.current) setIsLoading(false);
    }
  }, [api, isLoaded, isSignedIn, nextCursor, query, source]);

  const loadMatchCandidates = useCallback(async ({
    cursor,
    searchQuery,
  }: {
    cursor: string | null;
    searchQuery: string;
  }) => {
    if (!isLoaded) return false;
    if (!isSignedIn) {
      matchRequestGuard.current.invalidate();
      setMatchCandidates([]);
      setMatchNextCursor(null);
      setMatchError(null);
      setIsMatchLoading(false);
      return false;
    }

    const requestToken = matchRequestGuard.current.begin();
    setIsMatchLoading(true);
    setMatchError(null);
    try {
      const result = await api.listSalonMatchCandidates({
        q: searchQuery || undefined,
        status: "pending",
        limit: 20,
        cursor: cursor || undefined,
      });
      if (!matchRequestGuard.current.isCurrent(requestToken)) return false;
      setMatchCandidates(result.candidates);
      setMatchNextCursor(result.nextCursor);
      return true;
    } catch {
      if (!matchRequestGuard.current.isCurrent(requestToken)) return false;
      setMatchError("매칭 후보를 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.");
      return false;
    } finally {
      if (matchRequestGuard.current.isCurrent(requestToken)) {
        setIsMatchLoading(false);
      }
    }
  }, [api, isLoaded, isSignedIn]);

  useEffect(() => {
    void load();
  }, [api, isLoaded, isSignedIn, source]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const requestGuard = matchRequestGuard.current;
    void loadMatchCandidates({ cursor: null, searchQuery: "" }).then((loaded) => {
      if (loaded) {
        setAppliedMatchQuery("");
        setMatchCurrentCursor(null);
        setMatchCursorHistory([]);
      }
    });

    return () => requestGuard.invalidate();
  }, [loadMatchCandidates]);

  async function searchMatchCandidates() {
    const nextQuery = matchQuery.trim();
    setAppliedMatchQuery(nextQuery);
    setMatchCurrentCursor(null);
    setMatchNextCursor(null);
    setMatchCursorHistory([]);
    await loadMatchCandidates({ cursor: null, searchQuery: nextQuery });
  }

  async function showNextMatchPage() {
    if (!matchNextCursor || isMatchLoading) return;
    const next = matchNextCursor;
    const loaded = await loadMatchCandidates({ cursor: next, searchQuery: appliedMatchQuery });
    if (loaded) {
      setMatchCursorHistory((current) => [...current, matchCurrentCursor]);
      setMatchCurrentCursor(next);
    }
  }

  async function showPreviousMatchPage() {
    if (matchCursorHistory.length === 0 || isMatchLoading) return;
    const previous = matchCursorHistory.at(-1) || null;
    const loaded = await loadMatchCandidates({ cursor: previous, searchQuery: appliedMatchQuery });
    if (loaded) {
      setMatchCursorHistory((current) => current.slice(0, -1));
      setMatchCurrentCursor(previous);
    }
  }

  async function linkMatchCandidate(candidate: SalonMatchCandidate) {
    if (linkingRequestId) return;
    setLinkingRequestId(candidate.id);
    setMatchError(null);
    try {
      await api.linkSalonMatchCandidate(candidate.id);
      await Promise.all([
        load(),
        loadMatchCandidates({ cursor: matchCurrentCursor, searchQuery: appliedMatchQuery }),
      ]);
    } catch {
      setMatchError("회원 연결 상태가 변경되었거나 요청을 처리하지 못했습니다. 후보를 새로고침해 주세요.");
    } finally {
      setLinkingRequestId(null);
    }
  }

  const listHeader = (
    <Stack gap={16}>

      <Stack gap={14} style={{ padding: 16 }}>
        <Kicker>살롱 고객 관리</Kicker>
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
        <View accessibilityLiveRegion="assertive" accessibilityRole="alert">
          <Card>
            <Stack gap={12}>
              <BodyText>{error}</BodyText>
              <Button variant="secondary" onPress={() => router.push("/")}>
                홈으로 돌아가기
              </Button>
            </Stack>
          </Card>
        </View>
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
        <Button variant="secondary" disabled={isLoading} onPress={() => void load()}>
          {isLoading ? "조회 중..." : "검색"}
        </Button>
      </Stack>

      <Panel>
        <Stack gap={12}>
          <Heading style={{ fontSize: 20, lineHeight: 26 }}>회원 매칭 후보</Heading>
          <BodyText>
            현재 공유에 동의한 회원만 표시됩니다. 연결하면 CRM 고객으로 추가되고 고객 상세에서 연결을 해제할 수 있습니다.
          </BodyText>
          <TextField
            value={matchQuery}
            onChangeText={setMatchQuery}
            placeholder="회원 이름, 이메일 검색"
          />
          <Button variant="secondary" disabled={isMatchLoading} onPress={() => void searchMatchCandidates()}>
            {isMatchLoading ? "후보 확인 중..." : "후보 검색"}
          </Button>
          {matchError ? (
            <View accessibilityLiveRegion="assertive" accessibilityRole="alert">
              <Card>
                <Stack gap={10}>
                  <BodyText>{matchError}</BodyText>
                  <Button
                    variant="secondary"
                    disabled={isMatchLoading}
                    onPress={() => void loadMatchCandidates({
                      cursor: matchCurrentCursor,
                      searchQuery: appliedMatchQuery,
                    })}
                  >
                    후보 다시 불러오기
                  </Button>
                </Stack>
              </Card>
            </View>
          ) : null}
          {isMatchLoading && matchCandidates.length === 0 ? (
            <BodyText style={{ textAlign: "center" }}>후보를 불러오는 중입니다.</BodyText>
          ) : null}
          {!isMatchLoading && matchCandidates.length === 0 ? (
            <BodyText style={{ textAlign: "center" }}>대기 중인 매칭 후보가 없습니다.</BodyText>
          ) : null}
          {matchCandidates.map((candidate) => (
            <MatchCandidateCard
              key={candidate.id}
              candidate={candidate}
              isLinking={linkingRequestId === candidate.id}
              onLink={() => void linkMatchCandidate(candidate)}
            />
          ))}
          {matchCandidates.length > 0 || matchCursorHistory.length > 0 ? (
            <Stack gap={8}>
              <BodyText style={{ textAlign: "center" }}>
                {matchCursorHistory.length + 1}페이지 · 현재 {matchCandidates.length}명
                {matchNextCursor ? " · 다음 후보 있음" : " · 마지막 페이지"}
              </BodyText>
              <Cluster gap={8}>
                <Button
                  variant="secondary"
                  disabled={matchCursorHistory.length === 0 || isMatchLoading}
                  onPress={() => void showPreviousMatchPage()}
                >
                  이전
                </Button>
                <Button
                  variant="secondary"
                  disabled={!matchNextCursor || isMatchLoading}
                  onPress={() => void showNextMatchPage()}
                >
                  다음
                </Button>
              </Cluster>
            </Stack>
          ) : null}
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
      <BodyText>현재 {customers.length.toLocaleString("ko-KR")} / 총 {summary.totalCustomers.toLocaleString("ko-KR")}명</BodyText>
    </Stack>
  );

  return (
    <VirtualizedListScreen
        data={customers}
        keyExtractor={(customer) => customer.id}
        renderItem={({ item }) => <CustomerCard customer={item} />}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListHeaderComponent={listHeader}
        ListHeaderComponentStyle={{ marginBottom: 16 }}
        ListEmptyComponent={!isLoading ? <BodyText style={{ textAlign: "center" }}>등록된 고객이 없습니다.</BodyText> : null}
        ListFooterComponent={nextCursor ? (
          <Button variant="secondary" disabled={isLoading} onPress={() => void load({ append: true })}>
            {isLoading ? "불러오는 중..." : "고객 더 보기"}
          </Button>
        ) : null}
        contentContainerStyle={{ padding: 8, paddingBottom: 32 }}
        refreshControl={(
          <RefreshControl
            refreshing={(isLoading || isMatchLoading) && (customers.length > 0 || matchCandidates.length > 0)}
            onRefresh={() => void Promise.all([
              load(),
              loadMatchCandidates({ cursor: matchCurrentCursor, searchQuery: appliedMatchQuery }),
            ])}
          />
        )}
    />
  );
}
