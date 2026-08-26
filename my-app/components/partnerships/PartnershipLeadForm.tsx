"use client";

import Link from "next/link";
import Script from "next/script";
import type { FormEvent } from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  PARTNERSHIP_BUDGETS,
  PARTNERSHIP_TIMELINES,
  PARTNERSHIP_TYPES,
  type PartnershipType,
} from "../../lib/b2b-lead-contract";
import { mapWebResponseError } from "../../lib/web-user-message";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { SurfaceCard } from "../ui/Surface";

interface PartnershipFormState {
  partnershipType: PartnershipType;
  companyName: string;
  companyWebsite: string;
  contactName: string;
  email: string;
  phone: string;
  campaignGoal: string;
  targetAudience: string;
  desiredTimeline: string;
  budgetRange: string;
  referenceUrl: string;
  message: string;
  privacyConsent: boolean;
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

const initialForm: PartnershipFormState = {
  partnershipType: "advertising",
  companyName: "",
  companyWebsite: "",
  contactName: "",
  email: "",
  phone: "",
  campaignGoal: "",
  targetAudience: "",
  desiredTimeline: "",
  budgetRange: "",
  referenceUrl: "",
  message: "",
  privacyConsent: false,
};

const partnershipTypeLabels: Record<PartnershipType, string> = {
  advertising: "광고",
  branded_content: "브랜디드 콘텐츠",
  joint_campaign: "공동 캠페인",
  other: "기타 제휴",
};

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

export function PartnershipLeadForm() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";
  const widgetContainerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const [form, setForm] = useState<PartnershipFormState>(initialForm);
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

  function updateField<K extends keyof PartnershipFormState>(key: K, value: PartnershipFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetTurnstile() {
    window.turnstile?.reset(widgetIdRef.current || undefined);
    setTurnstileToken("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    if (!siteKey) {
      setError("보안 확인을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (!turnstileToken) {
      setError(turnstileRequiredMessage);
      return;
    }
    if (!form.privacyConsent) {
      setError("개인정보 수집·이용에 동의해야 제안을 제출할 수 있습니다.");
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/b2b/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          leadKind: "brand_partnership",
          turnstileToken,
          sourcePage: window.location.href,
        }),
      });

      if (!response.ok) {
        setError(mapWebResponseError(
          response.status,
          "제휴 제안을 접수하지 못했습니다. 입력 내용을 확인한 뒤 다시 시도해 주세요.",
        ));
        resetTurnstile();
        return;
      }

      setForm(initialForm);
      setSuccess("제휴 제안이 접수되었습니다. 검토 후 입력하신 이메일 또는 연락처로 회신드리겠습니다.");
      resetTurnstile();
    } catch {
      setError("네트워크 연결을 확인한 뒤 입력 내용을 유지한 채 다시 시도해 주세요.");
      resetTurnstile();
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <SurfaceCard id="partnership-inquiry" as="section" className="scroll-mt-24 p-5 sm:p-7 lg:p-8">
      {siteKey ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={() => setTurnstileReady(true)}
        />
      ) : null}

      <div className="max-w-2xl">
        <p className="app-kicker">맞춤 제안 문의</p>
        <h2 className="mt-3 text-2xl font-black tracking-tight text-[var(--app-text)] sm:text-3xl">
          캠페인의 목표부터 들려주세요
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
          아래 내용은 제휴 가능성 검토와 회신을 위해서만 사용합니다. 확정 단가나 보장 성과 없이 브랜드 상황에 맞춰 협업 범위를 검토합니다.
        </p>
      </div>

      <form className="mt-6" onSubmit={handleSubmit} noValidate={false}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="제휴 유형" required>
            {(controlProps) => (
              <select
                {...controlProps}
                value={form.partnershipType}
                onChange={(event) => updateField("partnershipType", event.target.value as PartnershipType)}
                className="app-input h-11 w-full px-3 text-sm"
              >
                {PARTNERSHIP_TYPES.map((type) => (
                  <option key={type} value={type}>{partnershipTypeLabels[type]}</option>
                ))}
              </select>
            )}
          </FormField>

          <FormField label="브랜드 / 회사명" required>
            {(controlProps) => (
              <input
                {...controlProps}
                value={form.companyName}
                onChange={(event) => updateField("companyName", event.target.value)}
                maxLength={120}
                autoComplete="organization"
                placeholder="브랜드 또는 회사 이름"
                className="app-input h-11 w-full px-3 text-sm"
              />
            )}
          </FormField>

          <FormField label="담당자명" required>
            {(controlProps) => (
              <input
                {...controlProps}
                value={form.contactName}
                onChange={(event) => updateField("contactName", event.target.value)}
                maxLength={80}
                autoComplete="name"
                placeholder="연락받을 담당자"
                className="app-input h-11 w-full px-3 text-sm"
              />
            )}
          </FormField>

          <FormField label="이메일" required>
            {(controlProps) => (
              <input
                {...controlProps}
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                maxLength={160}
                type="email"
                autoComplete="email"
                placeholder="name@company.com"
                className="app-input h-11 w-full px-3 text-sm"
              />
            )}
          </FormField>

          <FormField label="회사 웹사이트">
            {(controlProps) => (
              <input
                {...controlProps}
                value={form.companyWebsite}
                onChange={(event) => updateField("companyWebsite", event.target.value)}
                maxLength={500}
                type="url"
                inputMode="url"
                placeholder="https://brand.example"
                className="app-input h-11 w-full px-3 text-sm"
              />
            )}
          </FormField>

          <FormField label="연락처">
            {(controlProps) => (
              <input
                {...controlProps}
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                maxLength={40}
                type="tel"
                autoComplete="tel"
                placeholder="010-0000-0000"
                className="app-input h-11 w-full px-3 text-sm"
              />
            )}
          </FormField>

          <FormField label="캠페인 목표" required className="sm:col-span-2">
            {(controlProps) => (
              <textarea
                {...controlProps}
                value={form.campaignGoal}
                onChange={(event) => updateField("campaignGoal", event.target.value)}
                minLength={5}
                maxLength={500}
                rows={3}
                placeholder="예: 신제품 인지도 확대, 스타일 체험 전환, 시즌 캠페인 콘텐츠 제작"
                className="app-input w-full px-3 py-2.5 text-sm"
              />
            )}
          </FormField>

          <FormField label="타깃 고객">
            {(controlProps) => (
              <input
                {...controlProps}
                value={form.targetAudience}
                onChange={(event) => updateField("targetAudience", event.target.value)}
                maxLength={500}
                placeholder="예: 새로운 헤어스타일을 탐색하는 20–30대"
                className="app-input h-11 w-full px-3 text-sm"
              />
            )}
          </FormField>

          <FormField label="희망 시점" required>
            {(controlProps) => (
              <select
                {...controlProps}
                value={form.desiredTimeline}
                onChange={(event) => updateField("desiredTimeline", event.target.value)}
                className="app-input h-11 w-full px-3 text-sm"
              >
                <option value="">선택해 주세요</option>
                {PARTNERSHIP_TIMELINES.map((timeline) => (
                  <option key={timeline} value={timeline}>{timeline}</option>
                ))}
              </select>
            )}
          </FormField>

          <FormField label="예산 구간" required>
            {(controlProps) => (
              <select
                {...controlProps}
                value={form.budgetRange}
                onChange={(event) => updateField("budgetRange", event.target.value)}
                className="app-input h-11 w-full px-3 text-sm"
              >
                <option value="">선택해 주세요</option>
                {PARTNERSHIP_BUDGETS.map((budget) => (
                  <option key={budget} value={budget}>{budget}</option>
                ))}
              </select>
            )}
          </FormField>

          <FormField label="참고 URL">
            {(controlProps) => (
              <input
                {...controlProps}
                value={form.referenceUrl}
                onChange={(event) => updateField("referenceUrl", event.target.value)}
                maxLength={500}
                type="url"
                inputMode="url"
                placeholder="https://..."
                className="app-input h-11 w-full px-3 text-sm"
              />
            )}
          </FormField>

          <FormField label="상세 내용" required className="sm:col-span-2">
            {(controlProps) => (
              <textarea
                {...controlProps}
                value={form.message}
                onChange={(event) => updateField("message", event.target.value)}
                minLength={5}
                maxLength={2000}
                rows={6}
                placeholder="브랜드, 제품, 원하는 협업 방식과 참고해야 할 내용을 알려주세요."
                className="app-input w-full px-3 py-2.5 text-sm"
              />
            )}
          </FormField>
        </div>

        <div className="mt-5 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-4">
          <div className="flex items-start gap-3">
            <input
              id="partnership-privacy-consent"
              type="checkbox"
              checked={form.privacyConsent}
              onChange={(event) => updateField("privacyConsent", event.target.checked)}
              required
              aria-describedby="partnership-privacy-description"
              className="mt-1 h-4 w-4 shrink-0 accent-[var(--app-text)]"
            />
            <label htmlFor="partnership-privacy-consent" className="text-sm font-bold leading-6 text-[var(--app-text)]">
              개인정보 수집·이용에 동의합니다. <span aria-hidden="true">*</span>
            </label>
          </div>
          <p id="partnership-privacy-description" className="mt-2 pl-7 text-xs leading-5 text-[var(--app-muted)]">
            필수 수집 항목: 제휴 유형, 브랜드/회사명, 담당자명, 이메일, 캠페인 목표, 희망 시점, 예산 구간, 상세 내용. 선택 항목: 회사 웹사이트, 연락처, 타깃 고객, 참고 URL. 이용 목적: 제휴 검토와 회신. 보유 기간: 미계약 문의 접수 후 1년. 동의를 거부할 수 있으나 문의 제출은 불가합니다. 자세한 내용은{" "}
            <Link href="/privacy-policy" className="font-bold text-[var(--app-text)] underline underline-offset-4">개인정보 처리방침</Link>에서 확인할 수 있습니다.
          </p>
        </div>

        <div className="mt-4 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-3">
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
          className="mt-4 min-h-11 w-full sm:w-auto sm:min-w-52"
          loading={isSubmitting}
          loadingLabel="제안 접수 중…"
          disabled={hasHydrated && (!siteKey || !turnstileToken || !form.privacyConsent)}
        >
          제휴 제안 보내기
        </Button>
        {error ? <p role="alert" aria-live="assertive" className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}
        {success ? <p role="status" aria-live="polite" className="mt-3 text-sm font-semibold text-emerald-700">{success}</p> : null}
      </form>
    </SurfaceCard>
  );
}
