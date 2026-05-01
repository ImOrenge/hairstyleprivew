import type { PaymentResponse } from "@portone/browser-sdk/v2";
import type {
  MobilePaymentCompleteResponse,
  MobilePaymentPrepareResponse,
} from "@hairfit/shared";

export interface PortoneMobilePaymentRequest {
  paymentId: string;
  orderName: string;
  amountKrw: number;
  customerId: string;
  redirectUrl: string;
  appScheme: string;
  storeId?: string;
  channelKey?: string;
}

export interface PortoneMobilePaymentResult {
  paymentId: string;
  status: "paid" | "cancelled" | "failed" | "unknown";
  transactionId?: string | null;
  message?: string | null;
}

export interface PortoneMobileAdapter {
  requestPayment: (request: PortoneMobilePaymentRequest) => Promise<PortoneMobilePaymentResult>;
}

export async function runPortonePayment(
  adapter: PortoneMobileAdapter,
  request: PortoneMobilePaymentRequest,
) {
  const result = await adapter.requestPayment(request);
  return {
    ...result,
    shouldCompleteOnServer: result.status === "paid" || result.status === "unknown",
  };
}

export function toPortoneSdkPaymentRequest(
  prepared: MobilePaymentPrepareResponse,
): Record<string, unknown> {
  return {
    storeId: prepared.storeId,
    channelKey: prepared.channelKey,
    paymentId: prepared.paymentId,
    orderName: prepared.orderName,
    totalAmount: prepared.amountKrw,
    currency: "KRW",
    payMethod: "CARD",
    customer: {
      customerId: prepared.customerId,
    },
    redirectUrl: prepared.redirectUrl,
    appScheme: prepared.appScheme,
    forceRedirect: true,
    customData: {
      source: "hairfit-mobile",
      plan: prepared.plan,
      credits: prepared.credits,
    },
  };
}

export function normalizePortoneSdkResponse(
  response: PaymentResponse | undefined,
  fallbackPaymentId: string,
): PortoneMobilePaymentResult {
  if (!response) {
    return {
      paymentId: fallbackPaymentId,
      status: "unknown",
      transactionId: null,
      message: "Payment flow returned without a response.",
    };
  }

  if (response.code || response.message) {
    return {
      paymentId: response.paymentId || fallbackPaymentId,
      status: "failed",
      transactionId: response.txId ?? null,
      message: response.message ?? response.code ?? null,
    };
  }

  return {
    paymentId: response.paymentId || fallbackPaymentId,
    status: "unknown",
    transactionId: response.txId ?? null,
    message: null,
  };
}

export function formatCompletedPayment(result: MobilePaymentCompleteResponse) {
  return `${result.creditsGranted.toLocaleString("ko-KR")} credits granted for ${result.plan}.`;
}
