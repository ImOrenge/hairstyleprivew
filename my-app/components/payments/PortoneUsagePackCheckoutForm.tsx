"use client";

import { useState } from "react";
import type { UsagePackKey } from "../../lib/usage-pack";
import {
  completeUsagePackPayment,
  redirectToUsagePackLogin,
  type CompleteUsagePackResponse,
} from "../../lib/usage-pack-payment-client";
import { Button } from "../ui/Button";

interface PreparedUsagePackPayment {
  paymentId?: string;
  pack?: UsagePackKey;
  orderName?: string;
  amountKrw?: number;
  credits?: number;
  currency?: "KRW";
  payMethod?: "CARD";
  productType?: "DIGITAL";
  storeId?: string;
  channelKey?: string;
  redirectUrl?: string;
  customer?: {
    customerId?: string;
    fullName?: string;
    email?: string;
    phoneNumber?: string;
  };
  error?: string;
}

interface PaymentResponse {
  paymentId?: string;
  code?: string;
  message?: string;
}

interface PortoneUsagePackCheckoutFormProps {
  packKey: UsagePackKey;
  initialBuyerName?: string;
  initialBuyerEmail?: string;
  initialBuyerPhone?: string;
}

function normalizePhoneNumber(value: string) {
  return value.replace(/[^\d+]/g, "");
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhoneNumber(value: string) {
  return /^\+?\d{8,15}$/.test(normalizePhoneNumber(value));
}

function buildSuccessPath(result: CompleteUsagePackResponse) {
  const url = new URL("/mypage", window.location.origin);
  url.searchParams.set("tab", "plan");
  url.searchParams.set("payment", "success");
  url.searchParams.set("usage_pack", result.pack ?? "");
  if (typeof result.creditsGranted === "number") {
    url.searchParams.set("credits", String(result.creditsGranted));
  }
  if (result.paymentId) {
    url.searchParams.set("payment_id", result.paymentId);
  }
  return `${url.pathname}${url.search}`;
}

export function PortoneUsagePackCheckoutForm({
  packKey,
  initialBuyerName = "",
  initialBuyerEmail = "",
  initialBuyerPhone = "",
}: PortoneUsagePackCheckoutFormProps) {
  const [buyerName, setBuyerName] = useState(initialBuyerName);
  const [buyerEmail, setBuyerEmail] = useState(initialBuyerEmail);
  const [buyerPhone, setBuyerPhone] = useState(initialBuyerPhone);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startPayment = async () => {
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
      const prepareResponse = await fetch("/api/payments/usage-packs/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pack: packKey,
          buyerName: normalizedBuyerName,
          buyerEmail: normalizedBuyerEmail,
          buyerPhone: normalizedBuyerPhone,
        }),
      });

      if (prepareResponse.status === 401) {
        redirectToUsagePackLogin();
        return;
      }

      const prepared = (await prepareResponse.json().catch(() => ({}))) as PreparedUsagePackPayment;
      if (!prepareResponse.ok) {
        throw new Error(prepared.error ?? `결제 준비 실패 (${prepareResponse.status})`);
      }
      if (
        !prepared.paymentId ||
        !prepared.orderName ||
        !prepared.amountKrw ||
        !prepared.storeId ||
        !prepared.channelKey ||
        !prepared.redirectUrl ||
        !prepared.customer?.customerId
      ) {
        throw new Error("결제 준비 정보가 올바르지 않습니다.");
      }

      const PortOne = (await import("@portone/browser-sdk/v2").catch(() => null))?.default;
      if (!PortOne) {
        throw new Error("결제 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }

      const paymentResult = (await PortOne.requestPayment({
        storeId: prepared.storeId,
        channelKey: prepared.channelKey,
        paymentId: prepared.paymentId,
        orderName: prepared.orderName,
        totalAmount: prepared.amountKrw,
        currency: prepared.currency ?? "KRW",
        payMethod: prepared.payMethod ?? "CARD",
        productType: prepared.productType ?? "DIGITAL",
        customer: prepared.customer,
        redirectUrl: prepared.redirectUrl,
        customData: {
          purchaseType: "usage_pack",
          usagePackKey: packKey,
        },
      } as never)) as PaymentResponse | undefined;

      if (!paymentResult) {
        return;
      }
      if (paymentResult.code !== undefined) {
        if (paymentResult.code === "USER_CANCEL") {
          return;
        }
        throw new Error(paymentResult.message ?? "결제가 완료되지 않았습니다.");
      }

      const result = await completeUsagePackPayment(paymentResult.paymentId ?? prepared.paymentId);
      if (result) {
        window.location.assign(buildSuccessPath(result));
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "추가 이용권 결제 중 오류가 발생했습니다.";
      console.error(`[portone-usage-pack] ${packKey} payment failed:`, caught);
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
        void startPayment();
      }}
    >
      <fieldset className="grid gap-3">
        <legend className="text-sm font-black text-[var(--app-text)]">결제수단</legend>
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--app-border-strong)] bg-[var(--app-surface-muted)] p-4">
          <input type="radio" name="payMethod" value="CARD" checked readOnly className="mt-1" />
          <span className="grid gap-1">
            <span className="text-sm font-black text-[var(--app-text)]">카드 단건결제</span>
            <span className="text-xs leading-5 text-[var(--app-muted)]">
              선택한 추가 이용권 금액만 한 번 결제되며 정기결제 금액은 변경되지 않습니다.
            </span>
          </span>
        </label>
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
            required
            disabled={pending}
            className="h-11 rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-3 text-sm font-semibold text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)]"
          />
        </label>
      </div>

      {error ? (
        <p role="alert" className="rounded-md border border-[var(--app-danger)] bg-[var(--app-surface-muted)] p-3 text-xs font-semibold text-[var(--app-danger)]">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="h-11 w-full">
        {pending ? "결제 확인 중..." : "추가 이용권 결제하기"}
      </Button>
    </form>
  );
}
