"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { completeUsagePackPayment } from "../../lib/usage-pack-payment-client";

interface UsagePackPaymentReturnProps {
  paymentId: string;
}

type CompletionState =
  | { status: "checking" }
  | { status: "success"; creditsGranted: number }
  | { status: "error"; message: string };

export function UsagePackPaymentReturn({ paymentId }: UsagePackPaymentReturnProps) {
  const [state, setState] = useState<CompletionState>({ status: "checking" });

  useEffect(() => {
    let active = true;

    void completeUsagePackPayment(paymentId)
      .then((result) => {
        if (!active || !result) return;
        setState({ status: "success", creditsGranted: result.creditsGranted ?? 0 });
      })
      .catch((error) => {
        if (!active) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "결제 확인 중 오류가 발생했습니다.",
        });
      });

    return () => {
      active = false;
    };
  }, [paymentId]);

  if (state.status === "checking") {
    return <p className="text-sm text-[var(--app-muted)]">PortOne 결제 상태를 확인하고 있습니다.</p>;
  }

  if (state.status === "error") {
    return (
      <div className="grid gap-4">
        <p className="text-sm font-semibold text-[var(--app-danger)]">{state.message}</p>
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border-strong)] px-4 py-2 text-sm font-bold text-[var(--app-text)]"
          href="/mypage?tab=plan"
        >
          결제 내역 확인하기
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm font-semibold text-emerald-700">
        추가 이용량 {state.creditsGranted.toLocaleString("ko-KR")}이 지급되었습니다.
      </p>
      <Link
        className="inline-flex min-h-11 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-4 py-2 text-sm font-bold text-[var(--app-inverse-text)]"
        href="/mypage?tab=plan&payment=success"
      >
        마이페이지에서 확인하기
      </Link>
    </div>
  );
}
