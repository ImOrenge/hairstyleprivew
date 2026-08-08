"use client";

export interface PortoneV1PaymentRequest {
  channelKey: string;
  merchantUid: string;
  name: string;
  amount: number;
  buyerName: string;
  buyerEmail: string;
  buyerTel: string;
  redirectUrl: string;
  noticeUrl: string;
}

export interface PortoneV1CallbackResponse {
  success?: boolean;
  imp_success?: boolean;
  imp_uid?: string;
  merchant_uid?: string;
  error_code?: string;
  error_msg?: string;
}

interface PortoneV1RequestPayParameters {
  channelKey: string;
  pay_method: "card";
  merchant_uid: string;
  name: string;
  amount: number;
  currency: "KRW";
  buyer_name: string;
  buyer_email: string;
  buyer_tel: string;
  m_redirect_url: string;
  notice_url: string;
  custom_data: string;
}

interface PortoneV1ImpInstance {
  init: (impCode: string) => void;
  request_pay: (
    parameters: PortoneV1RequestPayParameters,
    callback: (response: PortoneV1CallbackResponse) => void,
  ) => void;
}

declare global {
  interface Window {
    IMP?: PortoneV1ImpInstance;
  }
}

const PORTONE_V1_SDK_URL = "https://cdn.iamport.kr/v1/iamport.js";

export function buildPortoneV1PaymentRequest(input: PortoneV1PaymentRequest) {
  return {
    channelKey: input.channelKey,
    pay_method: "card" as const,
    merchant_uid: input.merchantUid,
    name: input.name,
    amount: input.amount,
    currency: "KRW" as const,
    buyer_name: input.buyerName,
    buyer_email: input.buyerEmail,
    buyer_tel: input.buyerTel,
    m_redirect_url: input.redirectUrl,
    notice_url: input.noticeUrl,
    custom_data: JSON.stringify({ purchaseType: "usage_pack", merchantUid: input.merchantUid }),
  } satisfies PortoneV1RequestPayParameters;
}

export function loadPortoneV1Sdk(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("PortOne V1 SDK requires a browser"));
  }
  if (window.IMP) return Promise.resolve();

  const existing = document.querySelector<HTMLScriptElement>(
    'script[data-portone-v1-sdk="true"]',
  );
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("PortOne V1 SDK failed to load")),
        { once: true },
      );
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PORTONE_V1_SDK_URL;
    script.async = true;
    script.dataset.portoneV1Sdk = "true";
    script.onload = () => (window.IMP ? resolve() : reject(new Error("PortOne V1 SDK is unavailable")));
    script.onerror = () => reject(new Error("PortOne V1 SDK failed to load"));
    document.head.appendChild(script);
  });
}

export async function requestPortoneV1Payment(
  impCode: string,
  input: PortoneV1PaymentRequest,
): Promise<PortoneV1CallbackResponse> {
  await loadPortoneV1Sdk();
  if (!window.IMP) throw new Error("PortOne V1 SDK is unavailable");

  window.IMP.init(impCode);
  const parameters = buildPortoneV1PaymentRequest(input);

  return new Promise((resolve) => {
    window.IMP?.request_pay(parameters, resolve);
  });
}
