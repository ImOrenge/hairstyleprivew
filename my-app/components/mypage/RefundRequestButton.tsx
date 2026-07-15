"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/Button";

export function RefundRequestButton({
  disabled = false,
  paymentTransactionId,
}: {
  disabled?: boolean;
  paymentTransactionId: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (disabled || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/payments/refund-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentTransactionId,
          refundType: "full",
          reason,
        }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error || "환불 요청을 접수하지 못했습니다.");
      }

      setReason("");
      setIsOpen(false);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "환불 요청을 접수하지 못했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return (
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        className="h-9 rounded-[var(--app-radius-control)] border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-800 hover:bg-amber-100"
      >
        환불 요청
      </Button>
    );
  }

  return (
    <div className="mt-3 grid gap-2 border border-amber-200 bg-amber-50 p-3">
      <label className="grid gap-1 text-xs font-bold text-amber-900">
        환불 사유
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          maxLength={500}
          placeholder="환불이 필요한 이유를 입력해주세요."
          className="min-h-20 resize-y rounded-[var(--app-radius-control)] border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-[var(--app-text)] outline-none focus:border-amber-500"
        />
      </label>
      <p className="text-xs leading-5 text-amber-800">
        요청 후 관리자가 결제 상태와 사용한 서비스 이용량을 확인한 뒤 처리합니다.
      </p>
      {error ? <p className="text-xs font-semibold text-rose-600">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setIsOpen(false);
            setError(null);
          }}
          disabled={isSubmitting}
          className="h-9 px-3 text-xs"
        >
          닫기
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || isSubmitting || reason.trim().length < 5}
          className="h-9 px-3 text-xs"
        >
          {isSubmitting ? "접수 중" : "환불 요청 접수"}
        </Button>
      </div>
    </div>
  );
}
