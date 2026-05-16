import { useAuth } from "@clerk/clerk-expo";
import type { AdminMemberListRow } from "@hairfit/api-client";
import { BodyText, Button, Card, Chip, Cluster, Heading, Screen, Stack, TextField } from "@hairfit/ui-native";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
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
  const [query, setQuery] = useState("");
  const [accountType, setAccountType] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setMembers([]);
      setTotal(0);
      setError("관리자 계정으로 로그인해야 회원 목록을 볼 수 있습니다.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await api.listAdminMembers({
        q: query.trim() || undefined,
        accountType: accountType || undefined,
        limit: 80,
      });
      setMembers(result.members);
      setTotal(result.total);
    } catch (loadError) {
      setMembers([]);
      setTotal(0);
      setError(loadError instanceof Error ? loadError.message : "회원 목록을 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [api, isLoaded, isSignedIn, accountType]);

  const countLabel = useMemo(() => `총 ${total.toLocaleString("ko-KR")}명`, [total]);

  return (
    <Screen>
      <AdminTabs activePath="/admin/members" />

      <AdminPageHeader
        title="회원관리"
        countLabel={countLabel}
        description="Next.js 관리자 회원 목록과 같은 API를 사용해 권한, 온보딩, 크레딧 상태를 확인합니다."
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
          <Button variant="secondary" disabled={isLoading} onPress={load}>
            {isLoading ? "조회 중..." : "검색"}
          </Button>
        </Stack>
      </AdminPageHeader>

      {error ? (
        <Card>
          <BodyText>{error}</BodyText>
        </Card>
      ) : null}

      <Stack>
        {isLoading ? <AdminEmptyCard>회원 목록을 불러오는 중입니다.</AdminEmptyCard> : null}
        {!isLoading && members.length === 0 ? <AdminEmptyCard>조회된 회원이 없습니다.</AdminEmptyCard> : null}
        {members.map((member) => (
          <MemberCard key={member.id} member={member} />
        ))}
      </Stack>
    </Screen>
  );
}
