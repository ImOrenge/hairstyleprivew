"use client";

import { useEffect, useMemo, useState } from "react";
import { mapWebUserError, UserSafeError } from "../../lib/web-user-message";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { FormField } from "../ui/FormField";
import { InlineAlert } from "../ui/InlineAlert";

interface FeedbackModalProps {
  generationId: string;
}

interface ExistingReviewPayload {
  review: {
    rating: number;
    comment: string;
  } | null;
}

const STAR_VALUES = [1, 2, 3, 4, 5] as const;

function reviewRequestError(status: number, action: "load" | "save") {
  if (status === 401) return "로그인 상태를 확인한 뒤 다시 시도해 주세요.";
  if (status === 403) return "이 결과의 리뷰를 확인하거나 수정할 권한이 없습니다.";
  if (status === 404) return "리뷰할 생성 결과를 찾지 못했습니다.";
  if (status === 429) return "요청이 많습니다. 잠시 후 다시 시도해 주세요.";
  return action === "load" ? "리뷰를 불러오지 못했습니다." : "리뷰 저장에 실패했습니다.";
}

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
          throw new UserSafeError(reviewRequestError(response.status, "load"));
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
        setError(mapWebUserError(loadError, "리뷰를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
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

      if (!response.ok) {
        throw new UserSafeError(reviewRequestError(response.status, "save"));
      }

      setHasExistingReview(true);
      setSubmitted(true);
    } catch (submitError) {
      setError(mapWebUserError(submitError, "리뷰 저장에 실패했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button variant="ghost" onClick={handleOpen} disabled={!hasValidGenerationId}>
        리뷰 작성하기
      </Button>

      <Dialog
        id="result-feedback"
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            setOpen(true);
          } else {
            handleClose();
          }
        }}
        dismissible={!submitting}
        showCloseButton={!submitting}
        size="sm"
        title="결과 리뷰 작성"
        description="결과에 대한 별점과 후기를 남겨 주시면 품질 개선에 반영합니다."
        footer={
          <>
            <Button variant="ghost" onClick={handleClose} disabled={submitting}>
              닫기
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit || submitting || loadingExisting}>
              {submitting ? "저장 중..." : hasExistingReview ? "리뷰 수정 저장" : "리뷰 저장"}
            </Button>
          </>
        }
      >
        <div className="space-y-4" aria-busy={loadingExisting || submitting}>
          {loadingExisting ? (
            <p className="text-sm text-[var(--app-muted)]" role="status" aria-live="polite">
              기존 리뷰를 불러오는 중...
            </p>
          ) : (
            <>
              {hasExistingReview ? (
                <InlineAlert tone="info">기존 리뷰가 있습니다. 수정 후 다시 저장할 수 있습니다.</InlineAlert>
              ) : null}

              {submitted ? <InlineAlert tone="success">리뷰가 저장되었습니다.</InlineAlert> : null}

              <fieldset disabled={submitting}>
                <legend className="text-sm font-medium text-[var(--app-text)]">별점</legend>
                <div className="mt-2 flex items-center gap-1">
                  {STAR_VALUES.map((value) => {
                    const active = rating !== null && value <= rating;

                    return (
                      <label className="cursor-pointer" key={value}>
                        <input
                          className="peer sr-only"
                          type="radio"
                          name="review-rating"
                          value={value}
                          checked={rating === value}
                          onChange={() => setRating(value)}
                        />
                        <span
                          aria-hidden="true"
                          className={`inline-block rounded-sm px-0.5 text-2xl leading-none transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--app-ring)] ${
                            active ? "text-[var(--app-accent)]" : "text-[var(--app-subtle)] hover:text-[var(--app-muted)]"
                          }`}
                        >
                          ★
                        </span>
                        <span className="sr-only">{value}점</span>
                      </label>
                    );
                  })}
                  <span className="ml-2 text-sm text-[var(--app-muted)]" aria-live="polite">
                    {rating ? `${rating} / 5` : "선택 전"}
                  </span>
                </div>
              </fieldset>

              <FormField
                id="review-comment"
                label="후기"
                required
                disabled={submitting}
                description={`${trimmedComment.length}/800자 · 5자 이상 입력해 주세요.`}
                error={comment.length > 0 && trimmedComment.length < 5 ? "후기는 5자 이상 입력해 주세요." : undefined}
              >
                {(controlProps) => (
                  <textarea
                    {...controlProps}
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="예: 스타일이 자연스럽고 상담 전에 방향을 정하는 데 도움이 되었어요."
                    rows={4}
                    maxLength={800}
                    className="app-input w-full resize-y px-3 py-2 text-sm transition focus:ring-2 focus:ring-[var(--app-ring)]"
                  />
                )}
              </FormField>

              {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}
