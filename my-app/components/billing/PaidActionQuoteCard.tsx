"use client";

import Link from "next/link";
import type { PaidActionQuote } from "@hairfit/shared";
import { useCallback, useId, useSyncExternalStore } from "react";
import { buttonClassName, Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";
import { SurfaceCard } from "../ui/Surface";

export interface PaidActionQuoteCardProps {
  quote: PaidActionQuote | null;
  loading?: boolean;
  error?: string | null;
  payerLabel: string;
  billingHref: string;
  onRefresh: () => void;
}

type PaidActionQuoteCardState =
  | "loading"
  | "unavailable"
  | "ready"
  | "free"
  | "expired"
  | "insufficient"
  | "error";

function formatExpiry(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

const getQuoteExpiryServerSnapshot = () => false;

export function usePaidActionQuoteExpired(quote: PaidActionQuote | null) {
  const expiresAt = quote?.expiresAt ?? null;
  const getSnapshot = useCallback(
    () => Boolean(expiresAt && Date.parse(expiresAt) <= Date.now()),
    [expiresAt],
  );
  const subscribe = useCallback((onStoreChange: () => void) => {
    if (!expiresAt) return () => undefined;

    const remainingMs = Date.parse(expiresAt) - Date.now();
    const timeout = remainingMs > 0
      ? window.setTimeout(onStoreChange, remainingMs + 25)
      : undefined;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") onStoreChange();
    };

    window.addEventListener("focus", onStoreChange);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      window.removeEventListener("focus", onStoreChange);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [expiresAt]);

  return useSyncExternalStore(subscribe, getSnapshot, getQuoteExpiryServerSnapshot);
}

export function PaidActionQuoteCard({
  quote,
  loading = false,
  error,
  payerLabel,
  billingHref,
  onRefresh,
}: PaidActionQuoteCardProps) {
  const expired = usePaidActionQuoteExpired(quote);
  const titleId = useId();
  const summaryId = useId();
  const state: PaidActionQuoteCardState = loading
    ? "loading"
    : error
      ? "error"
      : !quote
        ? "unavailable"
        : expired
          ? "expired"
          : !quote.isAllowed
            ? "insufficient"
            : quote.isFree
              ? "free"
              : "ready";
  const title = state === "loading"
    ? "최신 잔액과 비용 확인 중"
    : state === "error"
      ? "견적을 불러오지 못했습니다"
      : state === "unavailable"
        ? "작업 전 견적을 확인해 주세요"
        : state === "expired"
          ? "견적을 다시 확인해 주세요"
          : state === "insufficient"
            ? `${quote?.shortfallCredits ?? 0}크레딧 충전 필요`
            : state === "free"
              ? "추가 차감 없음"
              : `${quote?.costCredits ?? 0}크레딧 사용 예정`;
  const summary = state === "loading"
    ? "서버에서 현재 잔액과 이번 작업 비용을 확인하고 있습니다."
    : state === "error"
      ? error
      : state === "unavailable"
        ? "견적을 확인하면 현재 잔액, 이번 작업 비용, 작업 후 예상 잔액을 비교할 수 있습니다."
        : state === "expired"
          ? "현재 잔액과 비용을 다시 확인하기 전에는 작업을 실행하지 않습니다."
            : state === "insufficient"
              ? "크레딧을 충전한 뒤 최신 견적을 다시 확인해야 작업을 실행할 수 있습니다."
              : quote
              ? `현재 ${quote.currentBalance}크레딧이며, 접수 시 ${quote.costCredits}크레딧을 예약하고 ${quote.balanceAfter}크레딧을 사용할 수 있습니다.`
              : "";
  const refreshLabel = state === "loading"
    ? "견적 확인 중"
    : state === "unavailable"
      ? "견적 확인"
      : state === "expired" || state === "error"
        ? "최신 견적 확인"
        : "견적 새로고침";

  return (
    <SurfaceCard
      as="section"
      aria-busy={loading}
      aria-describedby={summaryId}
      aria-labelledby={titleId}
      className="c-paid-action-quote"
      data-allowed={quote ? String(!expired && quote.isAllowed) : "unknown"}
      data-state={state}
    >
      <div className="c-paid-action-quote__header">
        <div className="c-paid-action-quote__copy">
          <p className="app-kicker">최신 크레딧 견적</p>
          <div aria-atomic="true" aria-live="polite" role="status">
            <h2 className="c-paid-action-quote__title" id={titleId}>{title}</h2>
            <p className="c-paid-action-quote__summary" id={summaryId}>{summary}</p>
          </div>
        </div>
        <Button
          className="c-paid-action-quote__refresh"
          loading={loading}
          loadingLabel="견적 확인 중"
          onClick={onRefresh}
          type="button"
          variant="secondary"
        >
          {refreshLabel}
        </Button>
      </div>

      {quote ? (
        <>
          <dl className="c-paid-action-quote__metrics">
            <div className="c-paid-action-quote__metric">
              <dt className="c-paid-action-quote__metric-label">현재 잔액</dt>
              <dd className="c-paid-action-quote__metric-value">
                {quote.currentBalance}크레딧
              </dd>
            </div>
            <div className="c-paid-action-quote__metric">
              <dt className="c-paid-action-quote__metric-label">이번 작업</dt>
              <dd className="c-paid-action-quote__metric-value">
                {quote.costCredits}크레딧
              </dd>
            </div>
            <div className="c-paid-action-quote__metric">
              <dt className="c-paid-action-quote__metric-label">작업 접수 후 예상 잔액</dt>
              <dd className="c-paid-action-quote__metric-value">
                {quote.balanceAfter}크레딧
              </dd>
            </div>
          </dl>

          <div className="c-paid-action-quote__details">
            <p>비용을 내는 계정: {payerLabel}</p>
            <p>{quote.failurePolicy}</p>
            {quote.lockConsequence ? <p>{quote.lockConsequence}</p> : null}
            <p>
              이 견적은 <time dateTime={quote.expiresAt}>{formatExpiry(quote.expiresAt)}</time>까지 유효합니다.
            </p>
          </div>

          {expired ? (
            <InlineAlert
              aria-live="off"
              className="c-paid-action-quote__notice"
              role="group"
              title="견적 유효 시간이 지났습니다"
              tone="warning"
            >
              현재 잔액과 비용을 다시 확인하기 전에는 작업을 실행하지 않습니다.
            </InlineAlert>
          ) : null}

          {!expired && !quote.isAllowed ? (
            <InlineAlert
              aria-live="off"
              action={(
                <Link className={buttonClassName("secondary")} href={billingHref}>
                  크레딧 충전
                </Link>
              )}
              className="c-paid-action-quote__notice"
              role="group"
              title={`${quote.shortfallCredits}크레딧이 부족합니다`}
              tone="warning"
            >
              결제를 마치고 돌아오면 자동 실행하지 않고 최신 견적을 다시 확인합니다.
            </InlineAlert>
          ) : null}
        </>
      ) : null}

      {error ? (
        <InlineAlert
          aria-live="off"
          className="c-paid-action-quote__notice"
          role="group"
          title="견적을 확인하지 못했습니다"
          tone="danger"
        >
          {error}
        </InlineAlert>
      ) : null}
    </SurfaceCard>
  );
}
