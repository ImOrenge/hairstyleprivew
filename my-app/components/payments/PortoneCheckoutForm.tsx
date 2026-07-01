"use client";

import { useState } from "react";
import { Button } from "../ui/Button";
import type { SelfServeSubscriptionPlanKey } from "./PortoneSubscriptionButton";

type BillingKeyMethod = "CARD";

interface PrepareBillingKeyResponse {
  plan?: SelfServeSubscriptionPlanKey;
  storeId?: string;
  channelKey?: string;
  billingKeyMethod?: BillingKeyMethod;
  issueId?: string;
  issueName?: string;
  displayAmount?: number;
  currency?: "KRW";
  customer?: {
    customerId?: string;
    email?: string;
    fullName?: string;
    phoneNumber?: string;
  };
  error?: string;
}

interface PortOneBillingKeyResponse {
  billingKey?: string;
  billingIssueToken?: string;
  code?: string;
  message?: string;
}

interface SubscribeResponseBody {
  subscriptionId?: string;
  plan?: string;
  credits?: number;
  periodEnd?: string;
  paymentId?: string;
  error?: string;
}

interface PortoneCheckoutFormProps {
  planKey: SelfServeSubscriptionPlanKey;
  initialBuyerName?: string;
  initialBuyerEmail?: string;
  initialBuyerPhone?: string;
  successRedirectPath?: string;
}

function currentReturnPath() {
  return `${window.location.pathname}${window.location.search}`;
}

function redirectToLogin() {
  window.location.assign(`/login?redirect_url=${encodeURIComponent(currentReturnPath())}`);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizePhoneNumber(value: string) {
  return value.replace(/[^\d+]/g, "");
}

function isValidPhoneNumber(value: string) {
  const normalized = normalizePhoneNumber(value);
  return /^\+?\d{8,15}$/.test(normalized);
}

function successRedirectUrl(
  path: string,
  planKey: SelfServeSubscriptionPlanKey,
  result: SubscribeResponseBody,
) {
  const url = new URL(path, window.location.origin);
  url.searchParams.set("tab", "plan");
  url.searchParams.set("subscribed", planKey);
  if (typeof result.credits === "number") {
    url.searchParams.set("credits", String(result.credits));
  }
  if (result.paymentId) {
    url.searchParams.set("payment_id", result.paymentId);
  }
  return `${url.pathname}${url.search}`;
}

export function PortoneCheckoutForm({
  planKey,
  initialBuyerName = "",
  initialBuyerEmail = "",
  initialBuyerPhone = "",
  successRedirectPath = "/mypage",
}: PortoneCheckoutFormProps) {
  const [billingKeyMethod, setBillingKeyMethod] = useState<BillingKeyMethod>("CARD");
  const [buyerName, setBuyerName] = useState(initialBuyerName);
  const [buyerEmail, setBuyerEmail] = useState(initialBuyerEmail);
  const [buyerPhone, setBuyerPhone] = useState(initialBuyerPhone);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startSubscription = async () => {
    const normalizedBuyerName = buyerName.trim();
    const normalizedBuyerEmail = buyerEmail.trim();
    const normalizedBuyerPhone = normalizePhoneNumber(buyerPhone.trim());
    if (!normalizedBuyerName) {
      setError("구매자 이름을 입력해 주세요.");
      return;
    }
    if (!normalizedBuyerEmail || !isValidEmail(normalizedBuyerEmail)) {
      setError("결제 안내를 받을 이메일을 정확히 입력해 주세요.");
      return;
    }
    if (!normalizedBuyerPhone || !isValidPhoneNumber(normalizedBuyerPhone)) {
      setError("결제 확인에 사용할 전화번호를 숫자 기준 8~15자리로 입력해 주세요.");
      return;
    }

    setPending(true);
    setError(null);

    try {
      const prepareResponse = await fetch("/api/payments/billing-key/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: planKey,
          billingKeyMethod,
          buyerName: normalizedBuyerName,
          buyerEmail: normalizedBuyerEmail,
          buyerPhone: normalizedBuyerPhone,
        }),
      });

      if (prepareResponse.status === 401) {
        redirectToLogin();
        return;
      }

      const prepared = (await prepareResponse.json().catch(() => ({}))) as PrepareBillingKeyResponse;
      if (!prepareResponse.ok) {
        throw new Error(prepared.error ?? `결제 준비 실패 (${prepareResponse.status})`);
      }
      if (!prepared.storeId || !prepared.issueId || !prepared.issueName || !prepared.customer?.customerId) {
        throw new Error("결제 준비 정보가 올바르지 않습니다.");
      }
      if (!prepared.customer.fullName?.trim()) {
        throw new Error("구매자 이름을 입력해 주세요.");
      }
      if (!prepared.customer.email?.trim()) {
        throw new Error("결제 안내를 받을 이메일을 입력해 주세요.");
      }
      if (!prepared.customer.phoneNumber?.trim()) {
        throw new Error("결제 확인에 사용할 전화번호를 입력해 주세요.");
      }

      const PortOne = (await import("@portone/browser-sdk/v2").catch(() => null))?.default;
      if (!PortOne) {
        throw new Error("결제 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }

      const issueResult = (await PortOne.requestIssueBillingKey({
        storeId: prepared.storeId,
        ...(prepared.channelKey ? { channelKey: prepared.channelKey } : {}),
        billingKeyMethod: prepared.billingKeyMethod ?? billingKeyMethod,
        issueId: prepared.issueId,
        issueName: prepared.issueName,
        displayAmount: prepared.displayAmount,
        currency: prepared.currency ?? "KRW",
        customer: prepared.customer,
      })) as PortOneBillingKeyResponse | undefined;

      if (issueResult?.code !== undefined) {
        if (issueResult.code === "USER_CANCEL") {
          return;
        }
        throw new Error(issueResult.message ?? "빌링키 발급에 실패했습니다.");
      }
      if (!issueResult?.billingKey) {
        throw new Error(issueResult?.message ?? "빌링키 발급에 실패했습니다.");
      }
      if (issueResult.billingKey === "NEEDS_CONFIRMATION" && !issueResult.billingIssueToken) {
        throw new Error("빌링키 발급 수동승인 토큰이 누락되었습니다.");
      }

      const subscribeResponse = await fetch("/api/payments/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: planKey,
          billingKey: issueResult.billingKey,
          billingIssueToken: issueResult.billingIssueToken,
          issueId: prepared.issueId,
          storeId: prepared.storeId,
          channelKey: prepared.channelKey,
        }),
      });

      if (subscribeResponse.status === 401) {
        redirectToLogin();
        return;
      }

      const result = (await subscribeResponse.json().catch(() => ({}))) as SubscribeResponseBody;
      if (!subscribeResponse.ok) {
        throw new Error(result.error ?? `구독 처리 실패 (${subscribeResponse.status})`);
      }

      window.location.assign(successRedirectUrl(successRedirectPath, planKey, result));
    } catch (err) {
      const message = err instanceof Error ? err.message : "구독 처리 중 오류가 발생했습니다.";
      console.error(`[portone-checkout] ${planKey} subscription failed:`, err);
      setError(message);
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void startSubscription();
      }}
    >
      <fieldset className="grid gap-3">
        <legend className="text-sm font-black text-[var(--app-text)]">결제수단</legend>
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--app-border-strong)] bg-[var(--app-surface-muted)] p-4">
          <input
            type="radio"
            name="billingKeyMethod"
            value="CARD"
            checked={billingKeyMethod === "CARD"}
            onChange={() => setBillingKeyMethod("CARD")}
            className="mt-1"
          />
          <span className="grid gap-1">
            <span className="text-sm font-black text-[var(--app-text)]">카드 정기결제</span>
            <span className="text-xs leading-5 text-[var(--app-muted)]">
              정기적으로 자동 결제됩니다.
            </span>
          </span>
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex cursor-not-allowed items-start gap-3 rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-4 opacity-60">
            <input type="radio" name="disabledMethod" disabled className="mt-1" />
            <span className="grid gap-1">
              <span className="text-sm font-black text-[var(--app-text)]">간편결제</span>
              <span className="text-xs text-[var(--app-muted)]">준비 중</span>
            </span>
          </label>
          <label className="flex cursor-not-allowed items-start gap-3 rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-4 opacity-60">
            <input type="radio" name="disabledMethod" disabled className="mt-1" />
            <span className="grid gap-1">
              <span className="text-sm font-black text-[var(--app-text)]">휴대폰 결제</span>
              <span className="text-xs text-[var(--app-muted)]">준비 중</span>
            </span>
          </label>
        </div>
      </fieldset>

      <div className="grid gap-3">
        <p className="text-sm font-black text-[var(--app-text)]">구매자 정보</p>
        <label className="grid gap-1 text-xs font-bold text-[var(--app-muted)]">
          구매자 이름
          <input
            type="text"
            autoComplete="name"
            value={buyerName}
            onChange={(event) => setBuyerName(event.target.value)}
            placeholder="홍길동"
            required
            disabled={pending}
            className="h-11 rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-3 text-sm font-semibold text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)]"
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-[var(--app-muted)]">
          이메일
          <input
            type="email"
            autoComplete="email"
            value={buyerEmail}
            onChange={(event) => setBuyerEmail(event.target.value)}
            placeholder="name@example.com"
            required
            disabled={pending}
            className="h-11 rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-3 text-sm font-semibold text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)]"
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-[var(--app-muted)]">
          전화번호
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={buyerPhone}
            onChange={(event) => setBuyerPhone(event.target.value)}
            placeholder="01012345678"
            required
            disabled={pending}
            className="h-11 rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-3 text-sm font-semibold text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)]"
          />
        </label>
        <p className="text-xs leading-5 text-[var(--app-subtle)]">
          이메일과 전화번호는 결제 확인, 영수증 안내, 환불 처리 연락에 사용합니다.
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-[var(--app-danger)] bg-[var(--app-surface-muted)] p-3 text-xs font-semibold text-[var(--app-danger)]">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="h-11 w-full">
        {pending ? "결제 연결 중..." : "결제단계로 진행하기"}
      </Button>
    </form>
  );
}
