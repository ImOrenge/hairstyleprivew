"use client";

import {
  normalizePaidActionQuote,
  type PaidActionExecutionReceipt,
  type PaidActionQuote,
  type PaidActionQuoteErrorCode,
} from "@hairfit/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import {
  PaidActionQuoteCard,
  usePaidActionQuoteExpired,
} from "../billing/PaidActionQuoteCard";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { InlineAlert } from "../ui/InlineAlert";

const SERVICE_OPTIONS = [
  { value: "cut", label: "커트" },
  { value: "perm", label: "펌" },
  { value: "color", label: "염색" },
  { value: "bleach", label: "탈색" },
  { value: "treatment", label: "트리트먼트" },
  { value: "other", label: "기타 시술" },
] as const;

type ServiceOptionValue = (typeof SERVICE_OPTIONS)[number]["value"];
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface AftercareConfirmDialogProps {
  generationId: string;
  selectedVariantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AftercareResponse {
  quote?: PaidActionQuote;
  creditReceipt?: PaidActionExecutionReceipt;
  redirectTo?: string;
  error?: string;
  code?: PaidActionQuoteErrorCode | string;
}

function getTodayValue(now = new Date()) {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function getSafeRedirectTarget(value: unknown) {
  if (typeof value !== "string") return "/aftercare";
  if (
    value === "/aftercare" ||
    /^\/aftercare\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    return value;
  }
  return "/aftercare";
}

export function AftercareConfirmDialog({
  generationId,
  selectedVariantId,
  open,
  onOpenChange,
}: AftercareConfirmDialogProps) {
  const router = useRouter();
  const requestSequenceRef = useRef(0);
  const [serviceType, setServiceType] = useState<ServiceOptionValue>("cut");
  const [serviceDate, setServiceDate] = useState(getTodayValue);
  const [quote, setQuote] = useState<PaidActionQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const quoteExpired = usePaidActionQuoteExpired(quote);

  const billingHref = useMemo(() => {
    const returnTo = `/result/${encodeURIComponent(generationId)}?variant=${encodeURIComponent(selectedVariantId)}`;
    return `/billing?${new URLSearchParams({ returnTo }).toString()}`;
  }, [generationId, selectedVariantId]);

  const loadQuote = useCallback(async (signal?: AbortSignal) => {
    const sequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = sequence;
    setQuoteLoading(true);
    setQuote(null);
    setQuoteError(null);
    setSubmitError(null);

    try {
      const response = await fetch("/api/paid-actions/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "aftercare",
          subjectId: generationId,
          billingScope: "customer",
        }),
        cache: "no-store",
        signal,
      });
      const data = (await response.json().catch(() => null)) as AftercareResponse | null;
      if (sequence !== requestSequenceRef.current || signal?.aborted) return;

      const nextQuote = normalizePaidActionQuote(data?.quote);
      if (!response.ok || !nextQuote) {
        setQuote(null);
        throw new Error(data?.error || "최신 에프터케어 견적을 불러오지 못했습니다.");
      }

      setQuote(nextQuote);
    } catch (error) {
      if (signal?.aborted || sequence !== requestSequenceRef.current) return;
      setQuoteError(
        error instanceof Error ? error.message : "최신 에프터케어 견적을 불러오지 못했습니다.",
      );
    } finally {
      if (sequence === requestSequenceRef.current && !signal?.aborted) {
        setQuoteLoading(false);
      }
    }
  }, [generationId]);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    const loadTimer = window.setTimeout(() => {
      void loadQuote(controller.signal);
    }, 0);

    return () => {
      window.clearTimeout(loadTimer);
      controller.abort();
      requestSequenceRef.current += 1;
    };
  }, [loadQuote, open, selectedVariantId]);

  const handleConfirm = async () => {
    if (
      isSubmitting ||
      !serviceDate ||
      !quote ||
      quoteExpired ||
      !quote.isAllowed
    ) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch("/api/hair-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationId,
          selectedVariantId,
          serviceType,
          serviceDate,
          quoteId: quote.quoteId,
        }),
      });
      const data = (await response.json().catch(() => null)) as AftercareResponse | null;
      const refreshedQuote = normalizePaidActionQuote(data?.quote);
      if (refreshedQuote) {
        setQuote(refreshedQuote);
      } else if (data?.code?.startsWith("QUOTE_")) {
        setQuote(null);
      }

      if (!response.ok) {
        throw new Error(data?.error || "에프터케어 기록을 만들지 못했습니다.");
      }

      onOpenChange(false);
      router.push(getSafeRedirectTarget(data?.redirectTo));
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "에프터케어 기록을 만들지 못했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      className="app-panel max-w-xl"
      description="시술 정보를 저장하고 선택한 헤어에 맞춘 케어 일정을 만듭니다."
      dismissible={!isSubmitting}
      onOpenChange={onOpenChange}
      open={open}
      title={(
        <>
          <span className="app-kicker block">Aftercare</span>
          <span className="mt-2 block text-xl font-black text-[var(--app-text)]">
            에프터케어 시술 확정
          </span>
        </>
      )}
    >
      <div className="grid gap-5">
        <PaidActionQuoteCard
          billingHref={billingHref}
          error={quoteError}
          loading={quoteLoading}
          onRefresh={() => void loadQuote()}
          payerLabel="내 HairFit 계정"
          quote={quote}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-bold text-[var(--app-text)]">
            시술 종류
            <select
              className="app-input h-11 px-3"
              disabled={isSubmitting}
              onChange={(event) => setServiceType(event.target.value as ServiceOptionValue)}
              value={serviceType}
            >
              {SERVICE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-bold text-[var(--app-text)]">
            시술 날짜
            <span className="relative">
              <CalendarDays
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-subtle)]"
              />
              <input
                className="app-input h-11 w-full pl-10 pr-3"
                disabled={isSubmitting}
                onChange={(event) => setServiceDate(event.target.value)}
                type="date"
                value={serviceDate}
              />
            </span>
          </label>
        </div>

        {submitError ? (
          <InlineAlert title="에프터케어를 확정하지 못했습니다" tone="danger">
            {submitError}
          </InlineAlert>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Button
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="secondary"
          >
            취소
          </Button>
          <Button
            disabled={
              isSubmitting ||
              quoteLoading ||
              !serviceDate ||
              !quote ||
              quoteExpired ||
              !quote.isAllowed
            }
            onClick={handleConfirm}
            type="button"
          >
            {isSubmitting
              ? "에프터케어 생성 중"
              : quote?.isFree
                ? "무료로 확정"
                : quote
                  ? `${quote.costCredits}크레딧으로 확정`
                  : "견적 확인 후 확정"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
