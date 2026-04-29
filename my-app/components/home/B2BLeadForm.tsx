"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";
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
        setError(null);
      },
      "expired-callback": () => setTurnstileToken(""),
      "error-callback": () => {
        setTurnstileToken("");
        setError("보안 확인을 완료하지 못했습니다. 다시 시도해 주세요.");
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

  async function handleSubmit() {
    if (isSubmitting) return;
    if (!siteKey) {
      setError("Turnstile 사이트 키가 설정되지 않았습니다.");
      return;
    }
    if (!turnstileToken) {
      setError("Cloudflare 보안 확인을 완료해 주세요.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

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
      setError(data.error || "B2B 문의 접수에 실패했습니다.");
      window.turnstile?.reset(widgetIdRef.current || undefined);
      setTurnstileToken("");
      setIsSubmitting(false);
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
    setIsSubmitting(false);
  }

  return (
    <SurfaceCard
      id="b2b-lead-form"
      className="p-4"
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

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <select
          value={form.planInterest}
          onChange={(event) => updateField("planInterest", event.target.value as PlanInterest)}
          className="app-input h-10 px-3 text-sm"
        >
          {planOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          value={form.region}
          onChange={(event) => updateField("region", event.target.value)}
          placeholder="지역"
          className="app-input h-10 px-3 text-sm"
        />
        <input
          value={form.companyName}
          onChange={(event) => updateField("companyName", event.target.value)}
          placeholder="살롱명 / 회사명"
          className="app-input h-10 px-3 text-sm"
        />
        <input
          value={form.contactName}
          onChange={(event) => updateField("contactName", event.target.value)}
          placeholder="담당자명"
          className="app-input h-10 px-3 text-sm"
        />
        <input
          value={form.email}
          onChange={(event) => updateField("email", event.target.value)}
          placeholder="이메일"
          type="email"
          className="app-input h-10 px-3 text-sm"
        />
        <input
          value={form.phone}
          onChange={(event) => updateField("phone", event.target.value)}
          placeholder="연락처"
          className="app-input h-10 px-3 text-sm"
        />
        <input
          value={form.shopCount}
          onChange={(event) => updateField("shopCount", event.target.value)}
          placeholder="지점 수"
          inputMode="numeric"
          className="app-input h-10 px-3 text-sm"
        />
        <input
          value={form.seatCount}
          onChange={(event) => updateField("seatCount", event.target.value)}
          placeholder="디자이너 / 좌석 수"
          inputMode="numeric"
          className="app-input h-10 px-3 text-sm"
        />
        <input
          value={form.monthlyClients}
          onChange={(event) => updateField("monthlyClients", event.target.value)}
          placeholder="월 상담 고객 수"
          inputMode="numeric"
          className="app-input h-10 px-3 text-sm"
        />
        <select
          value={form.desiredTimeline}
          onChange={(event) => updateField("desiredTimeline", event.target.value)}
          className="app-input h-10 px-3 text-sm"
        >
          <option value="">도입 희망 시점</option>
          <option value="immediately">즉시</option>
          <option value="within_1_month">1개월 이내</option>
          <option value="within_3_months">3개월 이내</option>
          <option value="researching">검토 중</option>
        </select>
        <select
          value={form.budgetRange}
          onChange={(event) => updateField("budgetRange", event.target.value)}
          className="app-input h-10 px-3 text-sm sm:col-span-2"
        >
          <option value="">예산 범위</option>
          <option value="under_100k">월 10만원 이하</option>
          <option value="100k_300k">월 10만-30만원</option>
          <option value="300k_1m">월 30만-100만원</option>
          <option value="custom">맞춤 견적 필요</option>
        </select>
        <input
          value={form.currentTools}
          onChange={(event) => updateField("currentTools", event.target.value)}
          placeholder="현재 사용하는 예약/CRM/상담 도구"
          className="app-input h-10 px-3 text-sm sm:col-span-2"
        />
        <textarea
          value={form.message}
          onChange={(event) => updateField("message", event.target.value)}
          rows={4}
          placeholder="도입 목적, 필요한 기능, 문의 내용을 적어주세요."
          className="app-input px-3 py-2 text-sm sm:col-span-2"
        />
      </div>

      <div className="mt-3 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-3">
        {siteKey ? (
          <div ref={widgetContainerRef} />
        ) : (
          <p className="text-xs font-semibold text-rose-700">NEXT_PUBLIC_TURNSTILE_SITE_KEY 설정이 필요합니다.</p>
        )}
      </div>

      <Button
        type="button"
        className="mt-3 h-10 w-full rounded-[var(--app-radius-control)] px-4 text-sm"
        onClick={handleSubmit}
        disabled={isSubmitting || !siteKey || !turnstileToken}
      >
        {isSubmitting ? "접수 중..." : "문의 보내기"}
      </Button>
      {error ? <p className="mt-2 text-xs font-semibold text-rose-700">{error}</p> : null}
      {success ? <p className="mt-2 text-xs font-semibold text-emerald-700">{success}</p> : null}
    </SurfaceCard>
  );
}
