import { useAuth } from "@clerk/clerk-expo";
import type { AdminMemberListRow } from "@hairfit/api-client";
import { BodyText, Button, Card, Chip, Cluster, Heading, Stack, TextField } from "@hairfit/ui-native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, View } from "react-native";
import { VirtualizedListScreen } from "../../components/app/VirtualizedListScreen";
import { AdminEmptyCard, AdminPageHeader, AdminTabs } from "../../lib/admin-ui";
import { useHairfitApi } from "../../lib/api";

const accountFilters = [
  { label: "전체", value: "" },
  { label: "고객", value: "member" },
  { label: "살롱", value: "salon_owner" },
  { label: "관리자", value: "admin" },
  { label: "미설정", value: "unset" },
] as const;

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}

function accountTypeLabel(value: string | null | undefined) {
  if (value === "admin") return "관리자";
  if (value === "salon_owner") return "살롱";
  if (value === "member") return "고객";
  return "미설정";
}

function MemberCard({ member }: { member: AdminMemberListRow }) {
  const router = useRouter();
  const title = member.display_name || member.email || member.id;

  return (
    <Card>
      <Stack gap={10}>
        <Cluster>
          <Chip tone={member.account_type === "admin" ? "accent" : "neutral"}>
            {accountTypeLabel(member.account_type)}
          </Chip>
          <Chip>{member.credits ?? 0} 크레딧</Chip>
          <Chip>{member.onboarding_completed_at ? "온보딩 완료" : "미완료"}</Chip>
        </Cluster>
        <Heading style={{ fontSize: 20, lineHeight: 26 }}>{title}</Heading>
        <BodyText>{member.email || "이메일 없음"}</BodyText>
        <BodyText>가입 {formatDate(member.created_at)} · 수정 {formatDate(member.updated_at)}</BodyText>
        <Button variant="secondary" onPress={() => router.push(`/admin/members/${encodeURIComponent(member.id)}`)}>
          상세 열기
        </Button>
      </Stack>
    </Card>
  );
}

export default function AdminMembersScreen() {
  const api = useHairfitApi();
  const { isLoaded, isSignedIn } = useAuth();
  const [members, setMembers] = useState<AdminMemberListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [accountType, setAccountType] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const load = useCallback(async (options: { append?: boolean } = {}) => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setMembers([]);
      setTotal(0);
      setNextCursor(null);
      setError("관리자 계정으로 로그인해야 회원 목록을 볼 수 있습니다.");
      return;
    }

    const sequence = ++requestSequence.current;
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.listAdminMembers({
        q: query.trim() || undefined,
        accountType: accountType || undefined,
        limit: 80,
        cursor: options.append ? nextCursor || undefined : undefined,
      });
      if (sequence !== requestSequence.current) return;
      setMembers((current) => (options.append ? [...current, ...result.members] : result.members));
      if (!options.append) setTotal(result.total);
      setNextCursor(result.nextCursor);
    } catch {
      if (sequence !== requestSequence.current) return;
      if (!options.append) {
        setMembers([]);
        setTotal(0);
        setNextCursor(null);
      }
      setError("회원 목록을 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      if (sequence === requestSequence.current) setIsLoading(false);
    }
  }, [accountType, api, isLoaded, isSignedIn, nextCursor, query]);

  useEffect(() => {
    void load();
  }, [accountType, api, isLoaded, isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const countLabel = useMemo(() => `총 ${total.toLocaleString("ko-KR")}명`, [total]);

  const listHeader = (
    <Stack>
      <AdminTabs activePath="/admin/members" />

      <AdminPageHeader
        title="회원관리"
        countLabel={countLabel}
        description="앱 회원관리는 조회 전용입니다. 회원·권한·온보딩·크레딧 상태를 확인하고, 권한과 크레딧 변경은 웹 관리자에서 진행해 주세요."
      >
        <Stack>
          <TextField value={query} onChangeText={setQuery} placeholder="user id / email / 이름 검색" />
          <Cluster>
            {accountFilters.map((filter) => (
              <Button
                key={filter.value || "all"}
                variant={accountType === filter.value ? "primary" : "secondary"}
                onPress={() => setAccountType(filter.value)}
              >
                {filter.label}
              </Button>
            ))}
          </Cluster>
          <Button variant="secondary" disabled={isLoading} onPress={() => void load()}>
            {isLoading ? "조회 중..." : "검색"}
          </Button>
        </Stack>
      </AdminPageHeader>

      {error ? (
        <View accessibilityLiveRegion="assertive" accessibilityRole="alert">
          <Card>
            <Stack gap={10}>
              <BodyText>{error}</BodyText>
              <Button variant="secondary" onPress={() => void load()}>다시 시도</Button>
            </Stack>
          </Card>
        </View>
      ) : null}
      <BodyText>현재 {members.length.toLocaleString("ko-KR")} / 총 {total.toLocaleString("ko-KR")}명</BodyText>
    </Stack>
  );

  return (
    <VirtualizedListScreen
        data={members}
        keyExtractor={(member) => member.id}
        renderItem={({ item }) => <MemberCard member={item} />}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListHeaderComponent={listHeader}
        ListHeaderComponentStyle={{ marginBottom: 16 }}
        ListEmptyComponent={!isLoading ? <AdminEmptyCard>조회된 회원이 없습니다.</AdminEmptyCard> : null}
        ListFooterComponent={nextCursor ? (
          <Button variant="secondary" disabled={isLoading} onPress={() => void load({ append: true })}>
            {isLoading ? "불러오는 중..." : "회원 더 보기"}
          </Button>
        ) : null}
        contentContainerStyle={{ gap: 0, padding: 8, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={isLoading && members.length > 0} onRefresh={() => void load()} />}
    />
  );
}
