import { useAuth } from "@clerk/clerk-expo";
import type { AdminMemberDetailResponse } from "@hairfit/api-client";
import { BodyText, Button, Card, Chip, Cluster, Heading, Kicker, Panel, Screen, Stack } from "@hairfit/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { AdminTabs } from "../../../lib/admin-ui";
import { useHairfitApi } from "../../../lib/api";

function readString(source: Record<string, unknown> | null | undefined, key: string) {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function readNumber(source: Record<string, unknown> | null | undefined, key: string) {
  const value = source?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatDate(value: unknown) {
  if (typeof value !== "string" || !value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function accountTypeLabel(value: string | null) {
  if (value === "admin") return "관리자";
  if (value === "salon_owner") return "살롱";
  if (value === "member") return "고객";
  return "미설정";
}

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <Kicker>{label}</Kicker>
      <Heading style={{ fontSize: 22, lineHeight: 28 }}>{value.toLocaleString("ko-KR")}</Heading>
    </Card>
  );
}

function ActivityList({
  empty,
  items,
  title,
}: {
  empty: string;
  items: Record<string, unknown>[];
  title: string;
}) {
  return (
    <Panel>
      <Stack>
        <Heading style={{ fontSize: 20, lineHeight: 26 }}>{title}</Heading>
        {items.length === 0 ? <BodyText>{empty}</BodyText> : null}
        {items.slice(0, 5).map((item, index) => (
          <Card key={String(item.id ?? index)}>
            <Stack gap={6}>
              <BodyText style={{ color: "#f4f1e8", fontWeight: "800" }}>
                {readString(item, "status") || readString(item, "style_name") || readString(item, "plan_key") || String(item.id ?? "-")}
              </BodyText>
              <BodyText>{formatDate(item.created_at ?? item.updated_at ?? item.paid_at)}</BodyText>
            </Stack>
          </Card>
        ))}
      </Stack>
    </Panel>
  );
}

export default function AdminMemberDetailScreen() {
  const api = useHairfitApi();
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const targetUserId = typeof userId === "string" ? userId : "";
  const { isLoaded, isSignedIn } = useAuth();
  const [detail, setDetail] = useState<AdminMemberDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isLoaded || !targetUserId) return;
      if (!isSignedIn) {
        setError("관리자 계정으로 로그인해야 회원 상세를 볼 수 있습니다.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const result = await api.getAdminMember(targetUserId);
        if (!cancelled) {
          setDetail(result);
        }
      } catch (loadError) {
        if (!cancelled) {
          setDetail(null);
          setError(loadError instanceof Error ? loadError.message : "회원 상세를 불러오지 못했습니다.");
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
  }, [api, isLoaded, isSignedIn, targetUserId]);

  const user = detail?.user ?? null;
  const displayName = readString(user, "display_name") || readString(user, "email") || targetUserId || "회원";
  const accountType = readString(user, "account_type");
  const credits = readNumber(user, "credits") ?? 0;

  return (
    <Screen>
      <AdminTabs activePath="/admin/members" />

      <Panel>
        <Stack>
          <Kicker>회원 상세</Kicker>
          <Heading>{displayName}</Heading>
          <BodyText>{targetUserId}</BodyText>
          <Cluster>
            <Chip tone={accountType === "admin" ? "accent" : "neutral"}>{accountTypeLabel(accountType)}</Chip>
            <Chip>{credits.toLocaleString("ko-KR")} 크레딧</Chip>
            <Chip>가입 {formatDate(user?.created_at)}</Chip>
          </Cluster>
          <Button variant="secondary" onPress={() => router.push("/admin/members")}>
            회원 목록
          </Button>
        </Stack>
      </Panel>

      {isLoading ? (
        <Card>
          <BodyText>회원 상세를 불러오는 중입니다.</BodyText>
        </Card>
      ) : null}

      {error ? (
        <Card>
          <BodyText>{error}</BodyText>
        </Card>
      ) : null}

      {detail ? (
        <>
          <Cluster>
            <CountCard label="헤어 생성" value={detail.activity.generations.length} />
            <CountCard label="스타일링" value={detail.activity.stylingSessions.length} />
            <CountCard label="결제" value={detail.activity.payments.length} />
          </Cluster>
          <ActivityList title="헤어 생성 기록" items={detail.activity.generations} empty="생성 기록이 없습니다." />
          <ActivityList title="결제/크레딧" items={[...detail.activity.payments, ...detail.activity.creditLedger]} empty="결제 기록이 없습니다." />
          <ActivityList title="살롱 고객/애프터케어" items={[...detail.salon.customers, ...detail.salon.aftercareTasks]} empty="살롱 활동이 없습니다." />
        </>
      ) : null}
    </Screen>
  );
}
