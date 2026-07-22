"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { SelfServeBillingPlanKey } from "../../lib/billing-plan";
import { mapWebUserError, UserSafeError } from "../../lib/web-user-message";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { InlineAlert } from "../ui/InlineAlert";

export interface SubscriptionWaitlistFormProps {
  initialEmail?: string;
  initialPlanKey?: SelfServeBillingPlanKey;
  lockPlan?: boolean;
  sourcePath?: string;
  onSubmitted?: () => void;
}

type SubmitState = "idle" | "submitting" | "success" | "error";

const planOptions: { key: SelfServeBillingPlanKey; label: string; description: string }[] = [
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

function emailValidationMessage(value: string) {
  if (!value) return "이메일을 입력해 주세요.";
  if (!isEmail(value)) return "이메일 형식을 확인해 주세요.";
  return null;
}

function waitlistRequestError(status: number) {
  if (status === 400) return "입력한 이메일과 신청 정보를 다시 확인해 주세요.";
  if (status === 429) return "신청 요청이 많습니다. 잠시 후 다시 시도해 주세요.";
  return "오픈 알림 신청에 실패했습니다. 잠시 후 다시 시도해 주세요.";
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
  const [emailTouched, setEmailTouched] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  const normalizedEmail = email.trim().toLowerCase();
  const submitting = submitState === "submitting";
  const submitted = submitState === "success";
  const formState = emailError ? "invalid" : submitState;

  useEffect(() => () => {
    requestControllerRef.current?.abort();
  }, []);

  function resetSubmissionResult() {
    if (submitState === "success" || submitState === "error") {
      setSubmitState("idle");
      setMessage(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationMessage = emailValidationMessage(normalizedEmail);
    if (validationMessage) {
      setEmailTouched(true);
      setEmailError(validationMessage);
      emailRef.current?.focus();
      return;
    }
    if (requestControllerRef.current || submitted) return;

    const controller = new AbortController();
    requestControllerRef.current = controller;
    setSubmitState("submitting");
    setMessage(null);
    setEmailError(null);

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
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => ({}))) as { duplicate?: boolean };
      if (!response.ok) {
        throw new UserSafeError(waitlistRequestError(response.status));
      }

      setSubmitState("success");
      setMessage(
        data.duplicate
          ? "이미 신청된 이메일입니다. 희망 플랜과 신청 정보가 갱신되었습니다."
          : "신청이 완료되었습니다. 구독 결제가 열리면 이메일로 먼저 안내드리겠습니다.",
      );
      onSubmitted?.();
    } catch (error) {
      if (controller.signal.aborted) return;
      setSubmitState("error");
      setMessage(mapWebUserError(error, "오픈 알림 신청에 실패했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
    }
  }

  return (
    <form
      aria-busy={submitting}
      className="c-subscription-waitlist"
      data-plan-locked={String(lockPlan)}
      data-state={formState}
      noValidate
      onSubmit={handleSubmit}
    >
      <div className="c-subscription-waitlist__fields">
        <FormField
          description="구독 오픈 안내를 받을 이메일입니다."
          disabled={submitting}
          error={emailError}
          id="subscription-waitlist-email"
          label="이메일"
          required
        >
          {(controlProps) => (
            <input
              {...controlProps}
              ref={emailRef}
              autoComplete="email"
              className="app-input c-subscription-waitlist__control"
              inputMode="email"
              onBlur={() => {
                setEmailTouched(true);
                setEmailError(emailValidationMessage(normalizedEmail));
              }}
              onChange={(event) => {
                const nextEmail = event.target.value;
                setEmail(nextEmail);
                if (emailTouched) {
                  setEmailError(emailValidationMessage(nextEmail.trim().toLowerCase()));
                }
                resetSubmissionResult();
              }}
              placeholder="you@example.com"
              type="email"
              value={email}
            />
          )}
        </FormField>

        <FormField
          description={lockPlan ? "선택한 플랜으로 신청됩니다." : "가장 관심 있는 플랜을 선택해 주세요."}
          disabled={lockPlan || submitting}
          id="subscription-waitlist-plan"
          label="희망 플랜"
        >
          {(controlProps) => (
            <select
              {...controlProps}
              className="app-input c-subscription-waitlist__control"
              onChange={(event) => {
                setPlanKey(event.target.value as SelfServeBillingPlanKey);
                resetSubmissionResult();
              }}
              value={planKey}
            >
              {planOptions.map((plan) => (
                <option key={plan.key} value={plan.key}>
                  {plan.label} - {plan.description}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <FormField
          description="선택 입력 · 500자 이내"
          disabled={submitting}
          id="subscription-waitlist-use-case"
          label="사용 목적"
        >
          {(controlProps) => (
            <textarea
              {...controlProps}
              className="app-input c-subscription-waitlist__control"
              data-control="textarea"
              maxLength={500}
              onChange={(event) => {
                setUseCase(event.target.value);
                resetSubmissionResult();
              }}
              placeholder="예: 미용실 상담 전 헤어 후보 비교, 패션 룩북까지 함께 확인"
              rows={3}
              value={useCase}
            />
          )}
        </FormField>
      </div>

      {message ? (
        <InlineAlert
          className="c-subscription-waitlist__feedback"
          title={submitState === "success" ? "신청 완료" : "신청 확인 필요"}
          tone={submitState === "success" ? "success" : "danger"}
        >
          {message}
        </InlineAlert>
      ) : null}

      <Button
        className="c-subscription-waitlist__submit"
        disabled={submitted}
        loading={submitting}
        loadingLabel="신청 중…"
        type="submit"
      >
        {submitted ? "신청 완료" : "오픈 알림 신청"}
      </Button>
    </form>
  );
}
