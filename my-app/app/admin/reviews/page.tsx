"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../../components/ui/Button";

interface ReviewRow {
  id: string;
  user_id: string;
  generation_id: string;
  rating: number;
  comment: string;
  is_hidden: boolean;
  hidden_reason: string | null;
  hidden_at: string | null;
  hidden_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ReviewResponse {
  reviews?: ReviewRow[];
  total?: number;
  nextCursor?: string | null;
  error?: string;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function AdminReviewsPage() {
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<"all" | "visible" | "hidden">("all");
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const listAbortController = useRef<AbortController | null>(null);

  const listUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set("q", query.trim());
    }
    if (visibility !== "all") {
      params.set("visibility", visibility);
    }
    params.set("limit", "120");
    return `/api/admin/reviews?${params.toString()}`;
  }, [query, visibility]);

  const loadReviews = useCallback(async (cursor?: string) => {
    listAbortController.current?.abort();
    const controller = new AbortController();
    listAbortController.current = controller;
    setIsLoading(true);
    setError(null);

    try {
      const url = new URL(listUrl, window.location.origin);
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await fetch(`${url.pathname}${url.search}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => ({}))) as ReviewResponse;
      if (!response.ok) {
        setError(
          response.status === 401 || response.status === 403
            ? "관리자 권한을 확인한 뒤 다시 시도해 주세요."
            : "리뷰 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }

      const nextReviews = data.reviews || [];
      setReviews((current) => (cursor ? [...current, ...nextReviews] : nextReviews));
      if (!cursor) setTotal(data.total ?? nextReviews.length);
      setNextCursor(data.nextCursor || null);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError("리뷰 목록 네트워크 요청에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [listUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadReviews();
    }, 180);

    return () => {
      window.clearTimeout(timer);
      listAbortController.current?.abort();
    };
  }, [loadReviews]);

  async function toggleVisibility(review: ReviewRow) {
    setBusyId(review.id);
    setError(null);

    let reason = "";
    let hidden = true;
    if (review.is_hidden) {
      hidden = false;
    } else {
      const input = window.prompt("숨김 사유를 입력해주세요.", review.hidden_reason || "");
      if (input === null) {
        setBusyId(null);
        return;
      }
      reason = input.trim();
      if (!reason) {
        setError("숨김 사유를 입력해주세요.");
        setBusyId(null);
        return;
      }
    }

    const response = await fetch(`/api/admin/reviews/${encodeURIComponent(review.id)}/visibility`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden, reason }),
    });
    if (!response.ok) {
      setError("리뷰 노출 상태를 변경하지 못했습니다. 최신 목록을 확인한 뒤 다시 시도해 주세요.");
    } else {
      await loadReviews();
    }
    setBusyId(null);
  }

  async function deleteReview(reviewId: string) {
    if (!window.confirm("리뷰를 삭제하시겠습니까?")) {
      return;
    }

    setBusyId(reviewId);
    setError(null);

    const response = await fetch(`/api/admin/reviews/${encodeURIComponent(reviewId)}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setError("리뷰를 삭제하지 못했습니다. 최신 목록을 확인한 뒤 다시 시도해 주세요.");
    } else {
      await loadReviews();
    }
    setBusyId(null);
  }

  return (
    <div className="space-y-4 pb-10">
      <header className="rounded-2xl border border-stone-200 bg-white p-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">관리자 대시보드</p>
        <h1 className="mt-2 text-2xl font-black text-stone-950">리뷰관리</h1>
        <p className="mt-2 text-sm text-stone-600">
          현재 {reviews.length.toLocaleString("ko-KR")} / 총 {total.toLocaleString("ko-KR")}건
        </p>
        <p className="mt-1 text-xs leading-5 text-stone-500">
          리뷰를 조회하고 노출 변경·삭제를 실행할 수 있습니다. 실행하면 공개 리뷰 상태가 즉시 변경됩니다.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <input
            aria-label="리뷰 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="리뷰 내용 / user id / generation id 검색"
            className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-900"
          />
          <select
            aria-label="리뷰 노출 상태"
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as "all" | "visible" | "hidden")}
            className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-900"
          >
            <option value="all">전체</option>
            <option value="visible">노출</option>
            <option value="hidden">숨김</option>
          </select>
        </div>
      </header>

      {error ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="space-y-3" aria-busy={isLoading}>
        {isLoading && reviews.length === 0 ? <p className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-sm text-stone-500">불러오는 중...</p> : null}
        {!isLoading && reviews.length === 0 ? (
          <p className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-sm text-stone-500">리뷰가 없습니다.</p>
        ) : null}

        {reviews.map((review) => (
          <article key={review.id} className="rounded-2xl border border-stone-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-stone-900">
                  평점 {review.rating} / user {review.user_id}
                </p>
                <p className="text-xs text-stone-500">
                  generation: {review.generation_id} · 작성: {formatDate(review.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    review.is_hidden ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {review.is_hidden ? "숨김" : "노출"}
                </span>
                <Button
                  type="button"
                  className="h-8 rounded-lg px-3 text-xs"
                  variant="secondary"
                  disabled={busyId === review.id}
                  onClick={() => void toggleVisibility(review)}
                >
                  {review.is_hidden ? "복원" : "숨김"}
                </Button>
                <Button
                  type="button"
                  className="h-8 rounded-lg px-3 text-xs"
                  variant="ghost"
                  disabled={busyId === review.id}
                  onClick={() => void deleteReview(review.id)}
                >
                  삭제
                </Button>
              </div>
            </div>

            <p className="mt-3 whitespace-pre-wrap rounded-lg border border-stone-100 bg-stone-50 px-3 py-3 text-sm leading-6 text-stone-700">
              {review.comment}
            </p>

            {review.is_hidden ? (
              <p className="mt-2 text-xs text-rose-700">
                숨김 사유: {review.hidden_reason || "-"} ({formatDate(review.hidden_at)})
              </p>
            ) : null}
          </article>
        ))}

        {nextCursor ? (
          <Button
            type="button"
            variant="secondary"
            disabled={isLoading}
            onClick={() => void loadReviews(nextCursor)}
          >
            {isLoading ? "불러오는 중..." : "리뷰 더 보기"}
          </Button>
        ) : null}
      </section>
    </div>
  );
}
