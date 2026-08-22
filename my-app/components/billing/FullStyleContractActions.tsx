"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/Button";

export function FullStyleContractActions({ contractId, cancelAtPeriodEnd }: { contractId: string; cancelAtPeriodEnd: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updateRenewal() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/v2/full-style-contracts/${encodeURIComponent(contractId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: cancelAtPeriodEnd ? "resume" : "cancel_at_period_end" }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error || "계약을 변경하지 못했습니다.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "계약을 변경하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return <div className="grid gap-2">
    <Button type="button" variant="secondary" loading={pending} onClick={() => void updateRenewal()}>
      {cancelAtPeriodEnd ? "자동갱신 계속하기" : "기간말 해지 예약"}
    </Button>
    {error ? <p role="alert" className="text-xs font-bold text-[var(--app-danger)]">{error}</p> : null}
  </div>;
}
