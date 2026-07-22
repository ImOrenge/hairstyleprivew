"use client";

import type { PaidActionQuote } from "@hairfit/shared";
import { useEffect, useRef, useState } from "react";
import { PaidActionQuoteCard } from "../billing/PaidActionQuoteCard";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Surface";

const readyQuote: PaidActionQuote = {
  quoteId: "e2e-ready-quote",
  action: "hair_generation",
  subjectId: "8c4c76b5-d91d-4d8a-bb0d-1a720e9d9882",
  billingScope: "customer",
  costCredits: 10,
  currentBalance: 50,
  balanceAfter: 40,
  shortfallCredits: 0,
  isFree: false,
  freeReason: null,
  isAllowed: true,
  issuedAt: "2099-07-19T08:00:00.000Z",
  expiresAt: "2099-07-19T08:05:00.000Z",
  policyVersion: "e2e-2026-07",
  lockConsequence: "접수하면 선택한 스타일과 10크레딧이 작업 완료까지 예약됩니다.",
  failurePolicy: "전체 생성 실패 시 예약한 크레딧을 자동으로 복구합니다.",
};

const quoteScenarios = {
  unavailable: { quote: null, loading: false, error: null },
  loading: { quote: null, loading: true, error: null },
  ready: { quote: readyQuote, loading: false, error: null },
  insufficient: {
    quote: {
      ...readyQuote,
      quoteId: "e2e-insufficient-quote",
      currentBalance: 4,
      balanceAfter: -6,
      shortfallCredits: 6,
      isAllowed: false,
    },
    loading: false,
    error: null,
  },
  expired: {
    quote: {
      ...readyQuote,
      quoteId: "e2e-expired-quote",
      issuedAt: "2000-07-19T08:00:00.000Z",
      expiresAt: "2000-07-19T08:05:00.000Z",
    },
    loading: false,
    error: null,
  },
  error: {
    quote: null,
    loading: false,
    error: "네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
  },
  free: {
    quote: {
      ...readyQuote,
      quoteId: "e2e-free-quote",
      costCredits: 0,
      balanceAfter: 50,
      isFree: true,
      freeReason: "first_program",
    },
    loading: false,
    error: null,
  },
} satisfies Record<string, {
  quote: PaidActionQuote | null;
  loading: boolean;
  error: string | null;
}>;

type QuoteScenario = keyof typeof quoteScenarios;

const scenarioLabels: Record<QuoteScenario, string> = {
  unavailable: "확인 필요",
  loading: "확인 중",
  ready: "사용 가능",
  insufficient: "잔액 부족",
  expired: "만료",
  error: "불러오기 실패",
  free: "무료",
};

export function PaidActionQuoteHarness() {
  const [scenario, setScenario] = useState<QuoteScenario>("unavailable");
  const [refreshCount, setRefreshCount] = useState(0);
  const refreshTimerRef = useRef<number | null>(null);
  const selected = quoteScenarios[scenario];

  useEffect(() => () => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
    }
  }, []);

  const refresh = () => {
    setScenario("loading");
    refreshTimerRef.current = window.setTimeout(() => {
      setScenario("ready");
      setRefreshCount((count) => count + 1);
      refreshTimerRef.current = null;
    }, 200);
  };

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-10">
      <Panel as="section" className="space-y-4 p-6" aria-labelledby="quote-harness-title">
        <p className="app-kicker">E2E 전용</p>
        <h1 id="quote-harness-title" className="text-3xl font-black text-[var(--app-text)]">
          작업 전 크레딧 견적 검증
        </h1>
        <p className="text-sm leading-6 text-[var(--app-muted)]">
          서버 견적의 확인 전·확인 중·사용 가능·부족·만료·오류·무료 상태를 검증합니다.
        </p>
        <div className="flex flex-wrap gap-2" aria-label="검증할 견적 상태">
          {(Object.keys(quoteScenarios) as QuoteScenario[]).map((key) => (
            <Button
              key={key}
              aria-pressed={scenario === key}
              onClick={() => setScenario(key)}
              type="button"
              variant={scenario === key ? "primary" : "secondary"}
            >
              {scenarioLabels[key]}
            </Button>
          ))}
        </div>
      </Panel>

      <PaidActionQuoteCard
        billingHref="/billing?returnTo=%2Fe2e-harness%2Fpaid-action-quote"
        error={selected.error}
        loading={selected.loading}
        onRefresh={refresh}
        payerLabel="내 HairFit 계정"
        quote={selected.quote}
      />

      <p aria-atomic="true" aria-live="polite" className="text-sm text-[var(--app-muted)]" role="status">
        완료된 견적 갱신 {refreshCount}회
      </p>
    </main>
  );
}
