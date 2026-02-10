"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/Button";

interface FeedbackModalProps {
  generationId: string;
}

interface ExistingReviewPayload {
  review: {
    rating: number;
    comment: string;
  } | null;
  error?: string;
}

const STAR_VALUES = [1, 2, 3, 4, 5] as const;

export function FeedbackModal({ generationId }: FeedbackModalProps) {
  const normalizedGenerationId = generationId.trim();
  const hasValidGenerationId =
    normalizedGenerationId.length > 0 && normalizedGenerationId.toLowerCase() !== "unknown";

  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [hasExistingReview, setHasExistingReview] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedComment = useMemo(() => comment.trim(), [comment]);
  const canSubmit = Boolean(
    hasValidGenerationId && rating && trimmedComment.length >= 5 && trimmedComment.length <= 800,
  );

  useEffect(() => {
    if (!open || !hasValidGenerationId) {
      return;
    }

    let cancelled = false;

    const loadExisting = async () => {
      setLoadingExisting(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/reviews?generationId=${encodeURIComponent(normalizedGenerationId)}`,
          {
            method: "GET",
            cache: "no-store",
          },
        );
        const payload = (await response.json().catch(() => null)) as ExistingReviewPayload | null;
        if (!response.ok) {
          throw new Error(payload?.error || "리뷰를 불러오지 못했습니다.");
        }

        if (cancelled) {
          return;
        }

        const review = payload?.review;
        if (review) {
          const nextRating = Number(review.rating);
          if (Number.isInteger(nextRating) && nextRating >= 1 && nextRating <= 5) {
            setRating(nextRating as 1 | 2 | 3 | 4 | 5);
          }
          setComment(review.comment || "");
          setHasExistingReview(true);
        } else {
          setRating(null);
          setComment("");
          setHasExistingReview(false);
        }
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "리뷰를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) {
          setLoadingExisting(false);
        }
      }
    };

    void loadExisting();

    return () => {
      cancelled = true;
    };
  }, [open, hasValidGenerationId, normalizedGenerationId]);

  const handleOpen = () => {
    setSubmitted(false);
    setError(null);
    setOpen(true);
  };

  const handleClose = () => {
    if (submitting) {
      return;
    }
    setOpen(false);
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          generationId: normalizedGenerationId,
          rating,
          comment: trimmedComment,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "리뷰 저장에 실패했습니다.");
      }

      setHasExistingReview(true);
      setSubmitted(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "리뷰 저장에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button variant="ghost" onClick={handleOpen} disabled={!hasValidGenerationId}>
        리뷰 작성하기
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-stone-900">결과 리뷰 작성</h3>
            <p className="mt-1 text-sm text-stone-600">
              결과에 대한 별점과 후기를 남겨주시면 품질 개선에 반영됩니다.
            </p>

            {loadingExisting ? (
              <p className="mt-4 text-sm text-stone-600">기존 리뷰를 불러오는 중...</p>
            ) : (
              <>
                {hasExistingReview ? (
                  <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                    기존 리뷰가 있습니다. 수정 후 다시 저장할 수 있습니다.
                  </p>
                ) : null}

                {submitted ? (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    리뷰가 저장되었습니다.
                  </div>
                ) : null}

                <div className="mt-4">
                  <p className="text-sm font-medium text-stone-700">별점</p>
                  <div className="mt-2 flex items-center gap-1">
                    {STAR_VALUES.map((value) => {
                      const active = rating !== null && value <= rating;

                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setRating(value)}
                          className={`text-2xl leading-none transition ${
                            active ? "text-amber-500" : "text-stone-300 hover:text-stone-500"
                          }`}
                          aria-label={`${value}점`}
                          disabled={submitting}
                        >
                          ★
                        </button>
                      );
                    })}
                    <span className="ml-2 text-sm text-stone-600">{rating ? `${rating} / 5` : "선택 안 함"}</span>
                  </div>
                </div>

                <div className="mt-4">
                  <label htmlFor="review-comment" className="text-sm font-medium text-stone-700">
                    후기
                  </label>
                  <textarea
                    id="review-comment"
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="예: 스타일이 자연스럽게 나와서 시술 전에 결정하는 데 도움이 됐어요."
                    rows={4}
                    maxLength={800}
                    className="mt-2 w-full resize-y rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-500 focus:ring-2 focus:ring-stone-300/60"
                    disabled={submitting}
                  />
                  <p className="mt-1 text-right text-xs text-stone-500">{trimmedComment.length}/800</p>
                </div>

                {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}

                <div className="mt-5 flex items-center justify-end gap-2">
                  <Button variant="ghost" onClick={handleClose} disabled={submitting}>
                    닫기
                  </Button>
                  <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
                    {submitting ? "저장 중..." : hasExistingReview ? "리뷰 수정 저장" : "리뷰 저장"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
