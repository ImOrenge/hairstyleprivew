"use client";

import Script from "next/script";
import type { FormEvent } from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { mapWebResponseError } from "../../lib/web-user-message";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { SurfaceCard } from "../ui/Surface";

type PlanInterest = "salon" | "pro" | "standard" | "basic" | "other";

interface LeadFormState {
  planInterest: PlanInterest;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  region: string;
  shopCount: string;
  seatCount: string;
  monthlyClients: string;
  currentTools: string;
  desiredTimeline: string;
  budgetRange: string;
  message: string;
}

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme?: "auto" | "light" | "dark";
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const initialForm: LeadFormState = {
  planInterest: "salon",
  companyName: "",
  contactName: "",
  email: "",
  phone: "",
  region: "",
  shopCount: "",
  seatCount: "",
  monthlyClients: "",
  currentTools: "",
  desiredTimeline: "",
  budgetRange: "",
  message: "",
};

const planOptions: Array<{ value: PlanInterest; label: string }> = [
  { value: "salon", label: "Salon / Enterprise" },
  { value: "pro", label: "Pro" },
  { value: "standard", label: "Standard" },
  { value: "basic", label: "Basic" },
  { value: "other", label: "아직 미정" },
];

const turnstileRequiredMessage = "Cloudflare 보안 확인을 완료해 주세요.";
const turnstileFailedMessage = "보안 확인을 완료하지 못했습니다. 다시 시도해 주세요.";
const turnstileExpiredMessage = "보안 확인 시간이 만료되었습니다. 다시 확인해 주세요.";

function subscribeToHydration() {
  return () => undefined;
}

function getHydratedSnapshot() {
  return true;
}

function getServerHydrationSnapshot() {
  return false;
}

function normalizeNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : trimmed;
}

export function B2BLeadForm() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";
  const widgetContainerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [form, setForm] = useState<LeadFormState>(initialForm);
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const hasHydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydrationSnapshot,
  );

  useEffect(() => {
    function handlePlanEvent(event: Event) {
      const detail = (event as CustomEvent<{ planInterest?: PlanInterest }>).detail;
      if (!detail?.planInterest) return;
      setForm((current) => ({ ...current, planInterest: detail.planInterest || "salon" }));
    }

    window.addEventListener("hairfit:b2b-plan", handlePlanEvent);
    return () => window.removeEventListener("hairfit:b2b-plan", handlePlanEvent);
  }, []);

  useEffect(() => {
    if (!turnstileReady || !siteKey || !widgetContainerRef.current || widgetIdRef.current || !window.turnstile) {
      return;
    }

    widgetIdRef.current = window.turnstile.render(widgetContainerRef.current, {
      sitekey: siteKey,
      theme: "auto",
      callback: (token) => {
        setTurnstileToken(token);
        setError((current) => (
          current === turnstileRequiredMessage
            || current === turnstileFailedMessage
            || current === turnstileExpiredMessage
            ? null
            : current
        ));
      },
      "expired-callback": () => {
        setTurnstileToken("");
        setError(turnstileExpiredMessage);
      },
      "error-callback": () => {
        setTurnstileToken("");
        setError(turnstileFailedMessage);
      },
    });

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, turnstileReady]);

  function updateField<K extends keyof LeadFormState>(key: K, value: LeadFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    if (!siteKey) {
      setError("Turnstile 사이트 키가 설정되지 않았습니다.");
      return;
    }
    if (!turnstileToken) {
      setError(turnstileRequiredMessage);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/b2b/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          shopCount: normalizeNumber(form.shopCount),
          seatCount: normalizeNumber(form.seatCount),
          monthlyClients: normalizeNumber(form.monthlyClients),
          turnstileToken,
          sourcePage: window.location.href,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as { error?: string; webhookDelivered?: boolean };
      if (!response.ok) {
        setError(mapWebResponseError(response.status, "B2B 문의 접수에 실패했습니다. 입력 내용을 확인한 뒤 다시 시도해 주세요."));
        window.turnstile?.reset(widgetIdRef.current || undefined);
        setTurnstileToken("");
        return;
      }

      setForm(initialForm);
      setSuccess(
        data.webhookDelivered === false
          ? "문의가 접수되었습니다. 내부 알림 전송은 재시도 대상입니다."
          : "문의가 접수되었습니다. 확인 후 연락드리겠습니다.",
      );
      window.turnstile?.reset(widgetIdRef.current || undefined);
      setTurnstileToken("");
    } catch {
      setError("네트워크 연결을 확인한 뒤 입력 내용을 유지한 채 다시 시도해 주세요.");
      window.turnstile?.reset(widgetIdRef.current || undefined);
      setTurnstileToken("");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SurfaceCard
      id="b2b-lead-form"
      className="min-w-0 p-4"
    >
      {siteKey ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={() => setTurnstileReady(true)}
        />
      ) : null}

      <div className="flex flex-col gap-1">
        <p className="text-sm font-black text-[var(--app-text)]">B2B 도입 문의</p>
        <p className="text-xs leading-5 text-[var(--app-muted)]">
          살롱 운영 규모와 도입 목적을 알려주시면 엔터프라이즈 상담으로 연결합니다.
        </p>
      </div>

      <form className="mt-3" onSubmit={handleSubmit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="관심 플랜">
            {(controlProps) => (
              <select
                {...controlProps}
                value={form.planInterest}
                onChange={(event) => updateField("planInterest", event.target.value as PlanInterest)}
                className="app-input h-10 w-full px-3 text-sm"
              >
                {planOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField label="지역">
            {(controlProps) => (
              <input
                {...controlProps}
                value={form.region}
                onChange={(event) => updateField("region", event.target.value)}
                placeholder="예: 서울 강남구"
                autoComplete="address-level2"
                className="app-input h-10 w-full px-3 text-sm"
              />
            )}
          </FormField>
          <FormField label="살롱명 / 회사명" required>
            {(controlProps) => (
              <input
                {...controlProps}
                value={form.companyName}
                onChange={(event) => updateField("companyName", event.target.value)}
                placeholder="사업체 이름"
                autoComplete="organization"
                className="app-input h-10 w-full px-3 text-sm"
              />
            )}
          </FormField>
          <FormField label="담당자명" required>
            {(controlProps) => (
              <input
                {...controlProps}
                value={form.contactName}
                onChange={(event) => updateField("contactName", event.target.value)}
                placeholder="연락받을 담당자"
                autoComplete="name"
                className="app-input h-10 w-full px-3 text-sm"
              />
            )}
          </FormField>
          <FormField label="이메일" required>
            {(controlProps) => (
              <input
                {...controlProps}
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                placeholder="name@company.com"
                type="email"
                autoComplete="email"
                className="app-input h-10 w-full px-3 text-sm"
              />
            )}
          </FormField>
          <FormField label="연락처">
            {(controlProps) => (
              <input
                {...controlProps}
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                placeholder="010-0000-0000"
                type="tel"
                autoComplete="tel"
                className="app-input h-10 w-full px-3 text-sm"
              />
            )}
          </FormField>
          <FormField label="지점 수">
            {(controlProps) => (
              <input
                {...controlProps}
                value={form.shopCount}
                onChange={(event) => updateField("shopCount", event.target.value)}
                placeholder="예: 1"
                inputMode="numeric"
                className="app-input h-10 w-full px-3 text-sm"
              />
            )}
          </FormField>
          <FormField label="디자이너 / 좌석 수">
            {(controlProps) => (
              <input
                {...controlProps}
                value={form.seatCount}
                onChange={(event) => updateField("seatCount", event.target.value)}
                placeholder="예: 8"
                inputMode="numeric"
                className="app-input h-10 w-full px-3 text-sm"
              />
            )}
          </FormField>
          <FormField label="월 상담 고객 수">
            {(controlProps) => (
              <input
                {...controlProps}
                value={form.monthlyClients}
                onChange={(event) => updateField("monthlyClients", event.target.value)}
                placeholder="예: 300"
                inputMode="numeric"
                className="app-input h-10 w-full px-3 text-sm"
              />
            )}
          </FormField>
          <FormField label="도입 희망 시점">
            {(controlProps) => (
              <select
                {...controlProps}
                value={form.desiredTimeline}
                onChange={(event) => updateField("desiredTimeline", event.target.value)}
                className="app-input h-10 w-full px-3 text-sm"
              >
                <option value="">선택해 주세요</option>
                <option value="immediately">즉시</option>
                <option value="within_1_month">1개월 이내</option>
                <option value="within_3_months">3개월 이내</option>
                <option value="researching">검토 중</option>
              </select>
            )}
          </FormField>
          <FormField label="예산 범위" className="sm:col-span-2">
            {(controlProps) => (
              <select
                {...controlProps}
                value={form.budgetRange}
                onChange={(event) => updateField("budgetRange", event.target.value)}
                className="app-input h-10 w-full px-3 text-sm"
              >
                <option value="">선택해 주세요</option>
                <option value="under_100k">월 10만원 이하</option>
                <option value="100k_300k">월 10만-30만원</option>
                <option value="300k_1m">월 30만-100만원</option>
                <option value="custom">맞춤 견적 필요</option>
              </select>
            )}
          </FormField>
          <FormField label="현재 사용하는 도구" className="sm:col-span-2">
            {(controlProps) => (
              <input
                {...controlProps}
                value={form.currentTools}
                onChange={(event) => updateField("currentTools", event.target.value)}
                placeholder="예약, CRM, 상담 도구 등을 적어주세요."
                className="app-input h-10 w-full px-3 text-sm"
              />
            )}
          </FormField>
          <FormField label="도입 목적과 문의 내용" required className="sm:col-span-2">
            {(controlProps) => (
              <textarea
                {...controlProps}
                value={form.message}
                onChange={(event) => updateField("message", event.target.value)}
                rows={4}
                placeholder="필요한 기능과 상담받고 싶은 내용을 적어주세요."
                className="app-input w-full px-3 py-2 text-sm"
              />
            )}
          </FormField>
        </div>

        <div className="mt-3 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-3">
          {siteKey ? (
            <div ref={widgetContainerRef} role="group" aria-label="자동 입력 방지 확인" />
          ) : (
            <p role="alert" className="text-xs font-semibold text-rose-700">
              보안 확인을 준비하지 못했습니다. 잠시 후 다시 열거나 고객지원으로 문의해 주세요.
            </p>
          )}
        </div>

        <Button
          type="submit"
          className="mt-3 h-10 w-full rounded-[var(--app-radius-control)] px-4 text-sm"
          disabled={isSubmitting || (hasHydrated && (!siteKey || !turnstileToken))}
        >
          {isSubmitting ? "접수 중..." : "문의 보내기"}
        </Button>
        {error ? <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{error}</p> : null}
        {success ? <p role="status" aria-live="polite" className="mt-2 text-xs font-semibold text-emerald-700">{success}</p> : null}
      </form>
    </SurfaceCard>
  );
}
