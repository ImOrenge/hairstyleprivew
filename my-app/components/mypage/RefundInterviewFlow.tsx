"use client";

import {
  REFUND_REASON_CATEGORIES,
  type RefundOutcome,
  type RefundQuote,
  type RefundReasonCategory,
  type RefundRequestResponse,
} from "@hairfit/shared";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { mapWebUserError } from "../../lib/web-user-message";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

const REASON_LABELS: Record<RefundReasonCategory, string> = {
  changed_mind: "단순 변심",
  accidental_renewal: "결제 또는 갱신 실수",
  price: "가격 부담",
  quality_expectation: "기대했던 결과와 다름",
  technical_issue: "서비스 장애 또는 기술 문제",
  duplicate_charge: "중복 결제",
  unauthorized_charge: "본인이 승인하지 않은 결제",
  privacy_or_safety: "개인정보 또는 안전 문제",
  other: "기타",
};

const STEP_LABELS = ["종료 방식", "환불 사유", "상세 확인", "환불 명세", "최종 동의"];

function formatKrw(value: number) {
  return `${Math.max(0, value).toLocaleString("ko-KR")} KRW`;
}

function outcomeDescription(outcome: RefundOutcome) {
  return outcome === "immediate_refund_and_cancel"
    ? "남은 결제분 크레딧을 회수하고 비례 환불한 뒤 구독을 즉시 종료합니다."
    : "현재 기간의 이용권과 크레딧은 유지하고 다음 정기결제만 중단합니다.";
}

export function RefundInterviewFlow({
  disabled = false,
  paymentTransactionId,
}: {
  disabled?: boolean;
  paymentTransactionId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [outcome, setOutcome] = useState<RefundOutcome>("immediate_refund_and_cancel");
  const [reasonCategory, setReasonCategory] = useState<RefundReasonCategory>("changed_mind");
  const [detail, setDetail] = useState("");
  const [affectedFeature, setAffectedFeature] = useState("");
  const [quote, setQuote] = useState<RefundQuote | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<RefundRequestResponse | null>(null);

  const manualReview = quote?.decision === "manual";
  const canContinue = useMemo(() => {
    if (step === 0) return true;
    if (step === 1) return Boolean(reasonCategory);
    if (step === 2) return detail.trim().length >= 5;
    if (step === 3) return quote !== null;
    return accepted;
  }, [accepted, detail, quote, reasonCategory, step]);

  function reset() {
    setStep(0);
    setOutcome("immediate_refund_and_cancel");
    setReasonCategory("changed_mind");
    setDetail("");
    setAffectedFeature("");
    setQuote(null);
    setAccepted(false);
    setError(null);
    setSubmitted(null);
  }

  async function loadQuote() {
    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/payments/refund-quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentTransactionId,
          outcome,
          reasonCategory,
          answers: { detail, affectedFeature: affectedFeature || null },
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { quote?: RefundQuote; error?: string }
        | null;
      if (!response.ok || !data?.quote) {
        throw new Error(data?.error || "환불 견적을 만들지 못했습니다.");
      }
      setQuote(data.quote);
      setStep(3);
    } catch (requestError) {
      setError(mapWebUserError(requestError, "환불 견적을 만들지 못했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      setIsBusy(false);
    }
  }

  async function submitRequest() {
    if (!quote || !accepted) return;
    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/payments/refund-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId: quote.id,
          idempotencyKey: crypto.randomUUID(),
          acceptedAmountKrw: quote.refundAmountKrw,
          outcome,
          reasonCategory,
          answers: { detail, affectedFeature: affectedFeature || null },
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | (RefundRequestResponse & { error?: string })
        | null;
      if (!response.ok || !data?.refundRequest) {
        throw new Error(data?.error || "환불 요청을 접수하지 못했습니다.");
      }
      setSubmitted(data);
      window.localStorage.setItem("hairfit:last-refund-request-id", data.refundRequest.id);
      router.refresh();
    } catch (requestError) {
      setError(mapWebUserError(requestError, "환불 요청을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="h-9 rounded-[var(--app-radius-control)] border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-800 hover:bg-amber-100"
      >
        환불·구독 종료
      </Button>
      <Dialog
        id="refund-interview-dialog"
        open={open}
        onOpenChange={(next) => {
          if (isBusy) return;
          setOpen(next);
          if (!next) reset();
        }}
        title={submitted ? "요청이 접수되었습니다" : "환불 및 구독 종료"}
        description={submitted ? "마이페이지에서 처리 상태를 계속 확인할 수 있습니다." : STEP_LABELS[step]}
        dismissible={!isBusy}
        size="lg"
        className="f-refund-interview"
        footer={
          submitted ? (
            <Button type="button" onClick={() => setOpen(false)}>확인</Button>
          ) : (
            <div className="flex w-full flex-wrap justify-between gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={isBusy || step === 0}
                onClick={() => {
                  setError(null);
                  setStep((current) => Math.max(0, current - 1));
                }}
              >
                이전
              </Button>
              {step < 2 ? (
                <Button type="button" disabled={!canContinue || isBusy} onClick={() => setStep(step + 1)}>
                  다음
                </Button>
              ) : step === 2 ? (
                <Button type="button" disabled={!canContinue || isBusy} onClick={() => void loadQuote()}>
                  {isBusy ? "계산 중…" : "환불 명세 확인"}
                </Button>
              ) : step === 3 ? (
                <Button type="button" disabled={!quote || isBusy} onClick={() => setStep(4)}>
                  최종 확인
                </Button>
              ) : (
                <Button type="button" disabled={!canContinue || isBusy} onClick={() => void submitRequest()}>
                  {isBusy ? "접수 중…" : outcome === "cancel_at_period_end" ? "다음 갱신 중단" : "환불 요청 확정"}
                </Button>
              )}
            </div>
          )
        }
      >
        {submitted ? (
          <div className="f-refund-interview__submitted" role="status" aria-live="polite">
            <p className="font-black text-[var(--app-text)]">
              {submitted.refundRequest.status === "manual_review_required"
                ? "담당자 검토가 시작되었습니다."
                : submitted.refundRequest.status === "period_end_scheduled"
                  ? "다음 정기결제가 중단되었습니다."
                  : "자동 환불 처리가 시작되었습니다."}
            </p>
            <p>요청 번호 {submitted.refundRequest.id}</p>
            <p>상태가 바뀌면 이메일과 허용된 기기의 푸시 알림으로 안내합니다.</p>
          </div>
        ) : (
          <div className="f-refund-interview__body" aria-busy={isBusy}>
            <ol className="f-refund-interview__steps" aria-label="환불 진행 단계">
              {STEP_LABELS.map((label, index) => (
                <li key={label} data-state={index === step ? "current" : index < step ? "complete" : "upcoming"}>
                  <span>{index + 1}</span><span className="sr-only sm:not-sr-only">{label}</span>
                </li>
              ))}
            </ol>

            {step === 0 ? (
              <fieldset className="f-refund-interview__options">
                <legend>원하는 종료 방식을 선택해 주세요.</legend>
                {(["immediate_refund_and_cancel", "cancel_at_period_end"] as const).map((value) => (
                  <label key={value} data-selected={outcome === value}>
                    <input type="radio" name="refund-outcome" value={value} checked={outcome === value} onChange={() => setOutcome(value)} />
                    <span><strong>{value === "immediate_refund_and_cancel" ? "즉시 차등 환불" : "다음 갱신 중단"}</strong>{outcomeDescription(value)}</span>
                  </label>
                ))}
              </fieldset>
            ) : null}

            {step === 1 ? (
              <fieldset className="f-refund-interview__options">
                <legend>가장 가까운 사유를 선택해 주세요.</legend>
                {REFUND_REASON_CATEGORIES.map((value) => (
                  <label key={value} data-selected={reasonCategory === value}>
                    <input type="radio" name="refund-reason" value={value} checked={reasonCategory === value} onChange={() => setReasonCategory(value)} />
                    <span><strong>{REASON_LABELS[value]}</strong></span>
                  </label>
                ))}
              </fieldset>
            ) : null}

            {step === 2 ? (
              <div className="grid gap-4">
                <label className="grid gap-2 text-sm font-bold text-[var(--app-text)]">
                  어떤 일이 있었나요?
                  <textarea value={detail} onChange={(event) => setDetail(event.target.value)} rows={5} maxLength={500} placeholder="5자 이상 입력해 주세요." />
                  <span className="text-xs font-medium text-[var(--app-muted)]">{detail.length}/500 · 사용량은 서버 기록으로 확인합니다.</span>
                </label>
                {reasonCategory === "technical_issue" ? (
                  <label className="grid gap-2 text-sm font-bold text-[var(--app-text)]">
                    문제가 발생한 기능
                    <input value={affectedFeature} onChange={(event) => setAffectedFeature(event.target.value)} maxLength={80} placeholder="예: 헤어스타일 생성" />
                  </label>
                ) : null}
              </div>
            ) : null}

            {step === 3 && quote ? (
              <div className="f-refund-interview__quote">
                <div><span>원 결제액</span><strong>{formatKrw(quote.originalAmountKrw)}</strong></div>
                <div><span>지급 / 사용 / 잔여</span><strong>{quote.creditsGranted} / {quote.creditsUsed} / {quote.creditsRemaining} 크레딧</strong></div>
                <div><span>회수 대상</span><strong>{quote.creditsToClawBack} 크레딧</strong></div>
                <div><span>보존되는 다른 크레딧</span><strong>{quote.preservedCredits} 크레딧</strong></div>
                <div className="f-refund-interview__quote-total"><span>예상 환불액</span><strong>{formatKrw(quote.refundAmountKrw)}</strong></div>
                <p>{manualReview ? "안전한 처리를 위해 담당자가 결제와 인터뷰 내용을 검토합니다." : quote.decision === "period_end" ? "환불과 크레딧 회수 없이 현재 기간 종료일까지 이용할 수 있습니다." : "현재 기록이 일치해 자동 처리 대상입니다."}</p>
              </div>
            ) : null}

            {step === 4 && quote ? (
              <div className="f-refund-interview__confirmation">
                <p className="font-black text-[var(--app-text)]">{outcomeDescription(outcome)}</p>
                <p>환불 견적은 {new Date(quote.expiresAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}까지 유효합니다.</p>
                <label><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>환불액, 크레딧 회수량과 구독 종료 시점을 확인했습니다.</span></label>
              </div>
            ) : null}

            {error ? <p className="f-refund-interview__error" role="alert">{error}</p> : null}
          </div>
        )}
      </Dialog>
    </>
  );
}
