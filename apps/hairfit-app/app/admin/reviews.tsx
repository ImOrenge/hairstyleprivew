import { useAuth } from "@clerk/clerk-expo";
import type { AdminReviewRow } from "@hairfit/api-client";
import { BodyText, Button, Card, Chip, Cluster, Heading, Stack, TextField } from "@hairfit/ui-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, View } from "react-native";
import { VirtualizedListScreen } from "../../components/app/VirtualizedListScreen";
import { AdminEmptyCard, AdminPageHeader, AdminTabs } from "../../lib/admin-ui";
import { useHairfitApi } from "../../lib/api";

const visibilityFilters = [
  { label: "전체", value: "" },
  { label: "노출", value: "visible" },
  { label: "숨김", value: "hidden" },
] as const;

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function ReviewCard({ review }: { review: AdminReviewRow }) {
  return (
    <Card>
      <Stack gap={10}>
        <Cluster>
          <Chip tone={review.is_hidden ? "danger" : "success"}>{review.is_hidden ? "숨김" : "노출"}</Chip>
          <Chip>평점 {review.rating}</Chip>
          <Chip>{formatDate(review.created_at)}</Chip>
        </Cluster>
        <Heading style={{ fontSize: 20, lineHeight: 26 }}>{review.comment || "리뷰 코멘트 없음"}</Heading>
        <BodyText>User {review.user_id}</BodyText>
        <BodyText>Generation {review.generation_id}</BodyText>
        {review.hidden_reason ? <BodyText>숨김 사유: {review.hidden_reason}</BodyText> : null}
      </Stack>
    </Card>
  );
}

export default function AdminReviewsScreen() {
  const api = useHairfitApi();
  const { isLoaded, isSignedIn } = useAuth();
  const [reviews, setReviews] = useState<AdminReviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [visibility, setVisibility] = useState<"" | "visible" | "hidden">("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const load = useCallback(async (options: { append?: boolean; cursor?: string | null } = {}) => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setReviews([]);
      setTotal(0);
      setNextCursor(null);
      setError("관리자 계정으로 로그인해야 리뷰를 볼 수 있습니다.");
      return;
    }

    const sequence = ++requestSequence.current;
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.listAdminReviews({
        q: appliedQuery || undefined,
        visibility: visibility || undefined,
        limit: 80,
        cursor: options.append ? options.cursor || undefined : undefined,
      });
      if (sequence !== requestSequence.current) return;
      setReviews((current) => (options.append ? [...current, ...result.reviews] : result.reviews));
      if (!options.append) setTotal(result.total);
      setNextCursor(result.nextCursor);
    } catch {
      if (sequence !== requestSequence.current) return;
      if (!options.append) {
        setReviews([]);
        setTotal(0);
        setNextCursor(null);
      }
      setError("리뷰 목록을 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해주세요.");
    } finally {
      if (sequence === requestSequence.current) setIsLoading(false);
    }
  }, [api, appliedQuery, isLoaded, isSignedIn, visibility]);

  useEffect(() => {
    void load();
  }, [load]);

  const countLabel = useMemo(
    () => `현재 ${reviews.length.toLocaleString("ko-KR")} / 총 ${total.toLocaleString("ko-KR")}건`,
    [reviews.length, total],
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
      <AdminTabs activePath="/admin/reviews" />

      <AdminPageHeader
        title="리뷰관리"
        countLabel={countLabel}
        description="앱에서는 리뷰와 노출 상태를 조회합니다. 노출 변경과 삭제는 웹 관리자에서만 할 수 있습니다."
      >
        <Stack>
          <TextField value={query} onChangeText={setQuery} placeholder="리뷰 내용 / user id / generation id 검색" />
          <Cluster>
            {visibilityFilters.map((filter) => (
              <Button
                key={filter.value || "all"}
                variant={visibility === filter.value ? "primary" : "secondary"}
                onPress={() => setVisibility(filter.value)}
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
        data={reviews}
        keyExtractor={(review) => review.id}
        renderItem={({ item }) => <ReviewCard review={item} />}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListHeaderComponent={listHeader}
        ListHeaderComponentStyle={{ marginBottom: 16 }}
        ListEmptyComponent={!isLoading ? <AdminEmptyCard>조회된 리뷰가 없습니다.</AdminEmptyCard> : null}
        ListFooterComponent={nextCursor ? (
          <Button
            variant="secondary"
            disabled={isLoading}
            onPress={() => void load({ append: true, cursor: nextCursor })}
          >
            {isLoading ? "불러오는 중..." : "리뷰 더 보기"}
          </Button>
        ) : null}
        contentContainerStyle={{ gap: 0, padding: 8, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={isLoading && reviews.length > 0} onRefresh={() => void load()} />}
    />
  );
}
