import { useAuth } from "@clerk/clerk-expo";
import type { AdminReviewRow } from "@hairfit/api-client";
import { BodyText, Button, Card, Chip, Cluster, Heading, Screen, Stack, TextField } from "@hairfit/ui-native";
import { useEffect, useMemo, useState } from "react";
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
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<"" | "visible" | "hidden">("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setReviews([]);
      setTotal(0);
      setError("관리자 계정으로 로그인해야 리뷰를 볼 수 있습니다.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await api.listAdminReviews({
        q: query.trim() || undefined,
        visibility: visibility || undefined,
        limit: 80,
      });
      setReviews(result.reviews);
      setTotal(result.total);
    } catch (loadError) {
      setReviews([]);
      setTotal(0);
      setError(loadError instanceof Error ? loadError.message : "리뷰 목록을 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [api, isLoaded, isSignedIn, visibility]);

  const countLabel = useMemo(() => `총 ${total.toLocaleString("ko-KR")}건`, [total]);

  return (
    <Screen>
      <AdminTabs activePath="/admin/reviews" />

      <AdminPageHeader
        title="리뷰관리"
        countLabel={countLabel}
        description="Next.js 리뷰 관리 API와 같은 목록/노출 상태를 확인합니다."
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
        {isLoading ? <AdminEmptyCard>리뷰를 불러오는 중입니다.</AdminEmptyCard> : null}
        {!isLoading && reviews.length === 0 ? <AdminEmptyCard>조회된 리뷰가 없습니다.</AdminEmptyCard> : null}
        {reviews.map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
      </Stack>
    </Screen>
  );
}
