import type {
  MobilePaymentCompleteResponse,
  MobilePaymentPlan,
  MobilePaymentPrepareResponse,
} from "@hairfit/shared";
import * as SecureStore from "expo-secure-store";

const LEGACY_PAYMENT_RESUME_STORAGE_KEY = "hairfit.pending-mobile-payment.v1";
const PAYMENT_RESUME_STORAGE_KEY_PREFIX = "hairfit.pending-mobile-payment.v2.";
const PAYMENT_ID_PATTERN = /^mob-[bsp]-[a-z0-9]+-[a-z0-9_-]{8,24}$/i;
const CUSTOMER_ID_PATTERN = /^[a-zA-Z0-9_-]{3,128}$/;
const MAX_FUTURE_CLOCK_SKEW_MS = 60 * 1000;

export const PAYMENT_AUTO_RESUME_WINDOW_MS = 30 * 60 * 1000;
export const DEFAULT_PAYMENT_RETURN_TO = "/mypage?tab=plan" as const;

export type PaymentResultReturnTo = `/result/${string}?variant=${string}`;
export type PaymentStylerReturnTo = `/styler/${string}`;
export type PaymentResumeReturnTo =
  | "/generate"
  | PaymentResultReturnTo
  | PaymentStylerReturnTo
  | typeof DEFAULT_PAYMENT_RETURN_TO;

const PAYMENT_RETURN_TO_ORIGIN = "https://mobile.hairfit.invalid";
const RESULT_PATH_PATTERN =
  /^\/result\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const STYLER_PATH_PATTERN =
  /^\/styler\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const RESULT_VARIANT_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

export interface PendingMobilePayment {
  version: 2;
  paymentId: string;
  customerId: string;
  plan: MobilePaymentPlan;
  createdAt: string;
  returnTo: PaymentResumeReturnTo;
}

export interface PaymentResumeStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type PaymentCompletionFailureKind =
  | "pending"
  | "retryable"
  | "manual_review"
  | "cancelled"
  | "failed";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPaymentPlan(value: unknown): value is MobilePaymentPlan {
  return value === "basic" || value === "standard" || value === "pro";
}

export function normalizePaymentResumePaymentId(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return PAYMENT_ID_PATTERN.test(normalized) ? normalized : null;
}

function normalizeCustomerId(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return CUSTOMER_ID_PATTERN.test(normalized) ? normalized : null;
}

export function normalizePaymentResumeReturnTo(value: unknown): PaymentResumeReturnTo {
  if (value === "/generate") return "/generate";
  if (typeof value !== "string" || value.length > 512) return DEFAULT_PAYMENT_RETURN_TO;

  try {
    const url = new URL(value, PAYMENT_RETURN_TO_ORIGIN);
    if (
      url.origin === PAYMENT_RETURN_TO_ORIGIN &&
      !url.hash &&
      !url.search &&
      STYLER_PATH_PATTERN.test(url.pathname)
    ) {
      return url.pathname.toLowerCase() as PaymentStylerReturnTo;
    }

    const variantValues = url.searchParams.getAll("variant");
    let onlyVariantQuery = true;
    url.searchParams.forEach((_queryValue, key) => {
      if (key !== "variant") onlyVariantQuery = false;
    });
    const variantId = variantValues[0] ?? "";

    if (
      url.origin !== PAYMENT_RETURN_TO_ORIGIN ||
      url.hash ||
      !RESULT_PATH_PATTERN.test(url.pathname) ||
      !onlyVariantQuery ||
      variantValues.length !== 1 ||
      !RESULT_VARIANT_PATTERN.test(variantId)
    ) {
      return DEFAULT_PAYMENT_RETURN_TO;
    }

    return `${url.pathname.toLowerCase()}?variant=${encodeURIComponent(variantId)}` as PaymentResultReturnTo;
  } catch {
    return DEFAULT_PAYMENT_RETURN_TO;
  }
}

function normalizePendingPayment(
  value: unknown,
  options: { version: 1 | 2 },
): PendingMobilePayment | null {
  if (!isRecord(value) || value.version !== options.version) return null;

  const paymentId = normalizePaymentResumePaymentId(value.paymentId);
  const customerId = normalizeCustomerId(value.customerId);
  const plan = isPaymentPlan(value.plan) ? value.plan : null;
  const createdAt = typeof value.createdAt === "string" ? value.createdAt : "";
  const createdAtMs = Date.parse(createdAt);
  if (!paymentId || !customerId || !plan || !Number.isFinite(createdAtMs)) return null;

  return {
    version: 2,
    paymentId,
    customerId,
    plan,
    createdAt: new Date(createdAtMs).toISOString(),
    returnTo: normalizePaymentResumeReturnTo(value.returnTo),
  };
}

function parseStoredPayment(
  serialized: string | null,
  options: { version: 1 | 2 },
) {
  if (!serialized) return null;
  try {
    return normalizePendingPayment(JSON.parse(serialized), options);
  } catch {
    return null;
  }
}

const securePaymentResumeStorage: PaymentResumeStorage = {
  async getItem(key) {
    if (!(await SecureStore.isAvailableAsync())) return null;
    return SecureStore.getItemAsync(key);
  },
  async setItem(key, value) {
    if (!(await SecureStore.isAvailableAsync())) {
      throw new Error("Secure payment recovery storage is unavailable");
    }
    await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key) {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.deleteItemAsync(key);
    }
  },
};

export function createPaymentResumeStore(storage: PaymentResumeStorage) {
  function storageKey(customerId: string) {
    return `${PAYMENT_RESUME_STORAGE_KEY_PREFIX}${customerId}`;
  }

  return {
    async save(
      prepared: Pick<MobilePaymentPrepareResponse, "paymentId" | "customerId" | "plan">,
      returnTo: unknown,
      expectedCustomerId: unknown,
      nowMs = Date.now(),
    ) {
      const customerId = normalizeCustomerId(prepared.customerId);
      const currentCustomerId = normalizeCustomerId(expectedCustomerId);
      if (!customerId || !currentCustomerId || customerId !== currentCustomerId) {
        throw new Error("Prepared payment does not belong to the current user");
      }
      const pending = normalizePendingPayment(
        {
          version: 2,
          paymentId: prepared.paymentId,
          customerId,
          plan: prepared.plan,
          createdAt: new Date(nowMs).toISOString(),
          returnTo,
        },
        { version: 2 },
      );
      if (!pending) throw new Error("Prepared payment recovery data is invalid");
      await storage.setItem(storageKey(customerId), JSON.stringify(pending));
      return pending;
    },

    async read(expectedCustomerId: unknown) {
      const customerId = normalizeCustomerId(expectedCustomerId);
      if (!customerId) return null;

      const key = storageKey(customerId);
      const serialized = await storage.getItem(key);
      const pending = parseStoredPayment(serialized, { version: 2 });
      if (pending?.customerId === customerId) return pending;
      if (serialized !== null) {
        // This account owns the namespaced key, so malformed data can be removed
        // without touching any other account's recoverable payment.
        await storage.removeItem(key);
      }

      const legacySerialized = await storage.getItem(LEGACY_PAYMENT_RESUME_STORAGE_KEY);
      const legacyPending = parseStoredPayment(legacySerialized, { version: 1 });
      if (legacyPending?.customerId === customerId) {
        await storage.setItem(key, JSON.stringify(legacyPending));
        await storage.removeItem(LEGACY_PAYMENT_RESUME_STORAGE_KEY);
        return legacyPending;
      }

      return null;
    },

    async clear(
      expectedCustomerId: unknown,
      expectedPaymentId?: string,
    ) {
      const customerId = normalizeCustomerId(expectedCustomerId);
      if (!customerId) return false;

      const key = storageKey(customerId);
      const serialized = await storage.getItem(key);
      if (serialized !== null) {
        const pending = parseStoredPayment(serialized, { version: 2 });
        if (!pending || pending.customerId !== customerId) return false;
        if (expectedPaymentId && pending.paymentId !== expectedPaymentId) return false;
        await storage.removeItem(key);
        return true;
      }

      const legacySerialized = await storage.getItem(LEGACY_PAYMENT_RESUME_STORAGE_KEY);
      const legacyPending = parseStoredPayment(legacySerialized, { version: 1 });
      if (legacyPending?.customerId === customerId) {
        if (expectedPaymentId && legacyPending.paymentId !== expectedPaymentId) return false;
        await storage.removeItem(LEGACY_PAYMENT_RESUME_STORAGE_KEY);
      }
      return true;
    },

    async purge(expectedCustomerId: unknown) {
      const customerId = normalizeCustomerId(expectedCustomerId);
      if (!customerId) return false;

      await storage.removeItem(storageKey(customerId));

      const legacySerialized = await storage.getItem(LEGACY_PAYMENT_RESUME_STORAGE_KEY);
      const legacyPending = parseStoredPayment(legacySerialized, { version: 1 });
      if (legacyPending?.customerId === customerId) {
        await storage.removeItem(LEGACY_PAYMENT_RESUME_STORAGE_KEY);
      }
      return true;
    },
  };
}

export type PaymentResumeStore = ReturnType<typeof createPaymentResumeStore>;
export const paymentResumeStore = createPaymentResumeStore(securePaymentResumeStorage);

export function isPaymentAutoResumeEligible(
  payment: Pick<PendingMobilePayment, "createdAt">,
  nowMs = Date.now(),
) {
  const createdAtMs = Date.parse(payment.createdAt);
  if (!Number.isFinite(createdAtMs)) return false;
  const ageMs = nowMs - createdAtMs;
  return ageMs >= -MAX_FUTURE_CLOCK_SKEW_MS && ageMs < PAYMENT_AUTO_RESUME_WINDOW_MS;
}

export function canStartNewMobilePayment(payment: PendingMobilePayment | null) {
  return payment === null;
}

export function classifyPaymentCompletionError(error: unknown): PaymentCompletionFailureKind {
  const errorRecord = isRecord(error) ? error : {};
  const payload = isRecord(errorRecord.payload) ? errorRecord.payload : {};
  const reason = typeof payload.reason === "string" ? payload.reason : "";
  const errorMessage = typeof payload.error === "string"
    ? payload.error
    : typeof errorRecord.message === "string"
      ? errorRecord.message
      : "";
  const providerStatus = typeof payload.portoneStatus === "string"
    ? payload.portoneStatus.trim().toUpperCase()
    : "";

  if (providerStatus === "CANCELLED" || providerStatus === "CANCELED") return "cancelled";
  if (providerStatus === "FAILED") return "failed";
  if (
    providerStatus === "PAID" ||
    providerStatus === "PARTIAL_CANCELLED" ||
    providerStatus === "PARTIAL_CANCELED" ||
    reason.includes("mismatch") ||
    /(?:amount|currency|metadata).*mismatch/i.test(errorMessage)
  ) return "manual_review";
  if (reason === "payment_not_paid") return "pending";
  return "retryable";
}

export function isMatchingPaidCompletion(
  result: unknown,
  pending: PendingMobilePayment,
): result is MobilePaymentCompleteResponse {
  if (!isRecord(result)) return false;
  return (
    result.ok === true &&
    result.status === "paid" &&
    result.paymentId === pending.paymentId &&
    result.plan === pending.plan
  );
}

export type PaymentCallbackResolution =
  | { kind: "paid"; payment: PendingMobilePayment }
  | {
      kind:
        | "missing"
        | "provider_error"
        | "callback_mismatch"
        | "account_changed"
        | PaymentCompletionFailureKind;
      payment: PendingMobilePayment | null;
    };

export async function completePendingPaymentCallback(input: {
  callbackPaymentId: unknown;
  completePayment: (paymentId: string) => Promise<unknown>;
  currentCustomerId: unknown;
  hasProviderError?: boolean;
  isCustomerActive?: (customerId: string) => boolean;
  store?: PaymentResumeStore;
}): Promise<PaymentCallbackResolution> {
  const store = input.store ?? paymentResumeStore;
  let payment: PendingMobilePayment | null;
  try {
    payment = await store.read(input.currentCustomerId);
  } catch {
    return { kind: "retryable", payment: null };
  }
  if (!payment) return { kind: "missing", payment: null };
  if (input.hasProviderError) return { kind: "provider_error", payment };

  const callbackPaymentId = normalizePaymentResumePaymentId(input.callbackPaymentId);
  if (!callbackPaymentId || callbackPaymentId !== payment.paymentId) {
    return { kind: "callback_mismatch", payment };
  }

  try {
    const result = await input.completePayment(payment.paymentId);
    if (input.isCustomerActive && !input.isCustomerActive(payment.customerId)) {
      return { kind: "account_changed", payment };
    }
    if (!isMatchingPaidCompletion(result, payment)) {
      return { kind: "manual_review", payment };
    }

    await store.clear(payment.customerId, payment.paymentId).catch(() => false);
    return { kind: "paid", payment };
  } catch (error) {
    if (input.isCustomerActive && !input.isCustomerActive(payment.customerId)) {
      return { kind: "account_changed", payment };
    }
    const kind = classifyPaymentCompletionError(error);
    if (kind === "cancelled" || kind === "failed") {
      await store.clear(payment.customerId, payment.paymentId).catch(() => false);
    }
    return { kind, payment };
  }
}
