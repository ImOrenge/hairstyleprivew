"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSubscriptionBillingPolicyKo } from "@hairfit/shared";
import { mapWebUserError } from "../../lib/web-user-message";
import { Button } from "../ui/Button";
import { ConfirmActionDialog } from "../ui/ConfirmActionDialog";

const cancellationPolicy = getSubscriptionBillingPolicyKo("cancellation");
const unusedCreditPolicy = getSubscriptionBillingPolicyKo("unusedCredits");

export function SubscriptionCancelButton({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

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

      setConfirmOpen(false);
      router.refresh();
    } catch (requestError) {
      setError(mapWebUserError(requestError, "구독 해지 예약에 실패했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid gap-2">
      <p className="text-xs leading-5 text-[var(--app-muted)]">
        {cancellationPolicy.description} {unusedCreditPolicy.description}
      </p>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          setError(null);
          setConfirmOpen(true);
        }}
        disabled={disabled || isSubmitting}
        className="h-10 rounded-[var(--app-radius-control)] border-rose-200 bg-rose-50 text-sm font-bold text-rose-700 hover:bg-rose-100"
      >
        이번 결제 기간 후 해지
      </Button>
      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => void handleCancel()}
        title="구독 해지를 예약할까요?"
        description="현재 결제 기간은 그대로 이용하고, 다음 자동결제부터 중단합니다."
        confirmLabel="기간 종료 후 해지 예약"
        pendingLabel="해지 예약 중…"
        isPending={isSubmitting}
        confirmDisabled={disabled}
        target="현재 활성 구독"
        beforeValue="현재 결제 기간 동안 이용 가능"
        afterValue="기간 종료 후 자동결제 중단"
        confirmationSlot={
          <div className="grid gap-2">
            <p className="text-sm leading-6 text-[var(--app-muted)]">{unusedCreditPolicy.description}</p>
            {error ? <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p> : null}
          </div>
        }
      />
    </div>
  );
}
