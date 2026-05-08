"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/Button";

export function SubscriptionCancelButton({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCancel = async () => {
    if (disabled || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/subscriptions/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelAtPeriodEnd: true }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error || "구독 해지 예약에 실패했습니다.");
      }

      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "구독 해지 예약에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant="secondary"
        onClick={handleCancel}
        disabled={disabled || isSubmitting}
        className="h-10 rounded-[var(--app-radius-control)] border-rose-200 bg-rose-50 text-sm font-bold text-rose-700 hover:bg-rose-100"
      >
        {isSubmitting ? "해지 예약 중" : "이번 결제 기간 후 해지"}
      </Button>
      {error ? <p className="text-xs font-semibold text-rose-600">{error}</p> : null}
    </div>
  );
}
