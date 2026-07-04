"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { SelfServeBillingPlanKey } from "../../lib/billing-plan";
import { Button } from "../ui/Button";

interface SubscriptionWaitlistFormProps {
  initialEmail?: string;
  initialPlanKey?: SelfServeBillingPlanKey;
  lockPlan?: boolean;
  sourcePath?: string;
  onSubmitted?: () => void;
}

type SubmitState = "idle" | "submitting" | "success" | "error";

const planOptions: Array<{ key: SelfServeBillingPlanKey; label: string; description: string }> = [
  {
    key: "basic",
    label: "Basic",
    description: "가볍게 월 구독을 시작하고 싶은 분",
  },
  {
    key: "standard",
    label: "Standard",
    description: "여러 헤어와 패션 스타일을 비교하고 싶은 분",
  },
  {
    key: "pro",
    label: "Pro",
    description: "상담 자료와 스타일 실험을 자주 준비하는 분",
  },
];

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function currentSourcePath(fallback?: string) {
  if (fallback) {
    return fallback;
  }

  if (typeof window === "undefined") {
    return "/";
  }

  return `${window.location.pathname}${window.location.search}`;
}

export function SubscriptionWaitlistForm({
  initialEmail = "",
  initialPlanKey = "standard",
  lockPlan = false,
  sourcePath,
  onSubmitted,
}: SubscriptionWaitlistFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [planKey, setPlanKey] = useState<SelfServeBillingPlanKey>(initialPlanKey);
  const [useCase, setUseCase] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const normalizedEmail = email.trim().toLowerCase();
  const canSubmit = submitState !== "submitting" && isEmail(normalizedEmail);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      setSubmitState("error");
      setMessage("유효한 이메일을 입력해 주세요.");
      return;
    }

    setSubmitState("submitting");
    setMessage(null);

    try {
      const response = await fetch("/api/subscription-waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          planKey,
          useCase,
          sourcePath: currentSourcePath(sourcePath),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; duplicate?: boolean };
      if (!response.ok) {
        throw new Error(data.error || "웨잇리스트 신청에 실패했습니다.");
      }

      setSubmitState("success");
      setMessage(
        data.duplicate
          ? "이미 신청된 이메일입니다. 희망 플랜과 신청 정보가 갱신되었습니다."
          : "신청이 완료되었습니다. 구독 결제가 열리면 이메일로 먼저 안내드리겠습니다.",
      );
      onSubmitted?.();
    } catch (error) {
      setSubmitState("error");
      setMessage(error instanceof Error ? error.message : "웨잇리스트 신청에 실패했습니다.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <label className="grid gap-1.5 text-sm font-bold text-[var(--app-text)]">
        이메일
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="app-input min-h-11 px-3 py-2 text-sm font-medium"
          required
        />
      </label>

      <label className="grid gap-1.5 text-sm font-bold text-[var(--app-text)]">
        희망 플랜
        <select
          value={planKey}
          onChange={(event) => setPlanKey(event.target.value as SelfServeBillingPlanKey)}
          disabled={lockPlan}
          className="app-input min-h-11 px-3 py-2 text-sm font-medium disabled:opacity-70"
        >
          {planOptions.map((plan) => (
            <option key={plan.key} value={plan.key}>
              {plan.label} - {plan.description}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1.5 text-sm font-bold text-[var(--app-text)]">
        사용 목적
        <textarea
          value={useCase}
          onChange={(event) => setUseCase(event.target.value)}
          rows={3}
          maxLength={500}
          placeholder="예: 미용실 상담 전 헤어 후보 비교, 패션 룩북까지 함께 확인"
          className="app-input min-h-24 resize-y px-3 py-2 text-sm font-medium"
        />
      </label>

      {message ? (
        <p
          className={`border px-3 py-2 text-sm font-semibold leading-6 ${
            submitState === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {message}
        </p>
      ) : null}

      <Button type="submit" disabled={!canSubmit} className="min-h-11 w-full px-5">
        {submitState === "submitting" ? "신청 중" : "오픈 알림 신청"}
      </Button>
    </form>
  );
}
