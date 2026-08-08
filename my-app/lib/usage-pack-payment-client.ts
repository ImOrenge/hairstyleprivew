"use client";

import type { UsagePackKey } from "./usage-pack";

export interface CompleteUsagePackResponse {
  paymentId?: string;
  pack?: UsagePackKey;
  creditsGranted?: number;
  currentCredits?: number | null;
  error?: string;
}

export function redirectToUsagePackLogin() {
  const returnTo = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?redirect_url=${encodeURIComponent(returnTo)}`);
}

export async function completeUsagePackPayment(paymentId: string) {
  const response = await fetch("/api/payments/usage-packs/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentId }),
  });

  if (response.status === 401) {
    redirectToUsagePackLogin();
    return null;
  }

  const result = (await response.json().catch(() => ({}))) as CompleteUsagePackResponse;
  if (!response.ok) {
    throw new Error(result.error ?? `결제 확인 실패 (${response.status})`);
  }
  return result;
}
