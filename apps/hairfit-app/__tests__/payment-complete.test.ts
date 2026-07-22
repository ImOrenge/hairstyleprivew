import {
  canStartNewMobilePayment,
  completePendingPaymentCallback,
  createPaymentResumeStore,
  type PaymentResumeStorage,
} from "../lib/payment-resume";

const PAYMENT_ID = "mob-s-mdeswabc-123456789abc";
const CUSTOMER_ID = "user_hairfit_owner";
const OTHER_CUSTOMER_ID = "user_other_account";

function createMemoryPaymentStore() {
  const values = new Map<string, string>();
  const storage: PaymentResumeStorage = {
    getItem: jest.fn(async (key) => values.get(key) ?? null),
    setItem: jest.fn(async (key, value) => {
      values.set(key, value);
    }),
    removeItem: jest.fn(async (key) => {
      values.delete(key);
    }),
  };
  return {
    storage,
    store: createPaymentResumeStore(storage),
  };
}

async function preparePayment() {
  const memory = createMemoryPaymentStore();
  await memory.store.save(
    { paymentId: PAYMENT_ID, customerId: CUSTOMER_ID, plan: "standard" },
    "/generate",
    CUSTOMER_ID,
  );
  jest.clearAllMocks();
  return memory;
}

function paidResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: "paid",
    paymentId: PAYMENT_ID,
    plan: "standard",
    transactionId: "transaction-id",
    creditsGranted: 200,
    ledgerId: "ledger-id",
    ...overrides,
  };
}

describe("mobile payment completion callback contract", () => {
  test("verifies the stored payment, clears it, and prevents duplicate completion", async () => {
    const memory = await preparePayment();
    const completePayment = jest.fn(async () => paidResponse());

    const resolution = await completePendingPaymentCallback({
      callbackPaymentId: PAYMENT_ID,
      completePayment,
      currentCustomerId: CUSTOMER_ID,
      isCustomerActive: (customerId) => customerId === CUSTOMER_ID,
      store: memory.store,
    });

    expect(resolution).toMatchObject({
      kind: "paid",
      payment: { paymentId: PAYMENT_ID, customerId: CUSTOMER_ID, returnTo: "/generate" },
    });
    expect(completePayment).toHaveBeenCalledTimes(1);
    await expect(completePendingPaymentCallback({
      callbackPaymentId: PAYMENT_ID,
      completePayment,
      currentCustomerId: CUSTOMER_ID,
      store: memory.store,
    })).resolves.toEqual({ kind: "missing", payment: null });
    expect(completePayment).toHaveBeenCalledTimes(1);
  });

  test("does not query or clear when the callback payment ID mismatches storage", async () => {
    const memory = await preparePayment();
    const completePayment = jest.fn();

    await expect(completePendingPaymentCallback({
      callbackPaymentId: "mob-s-mdeswother-abcdef123456",
      completePayment,
      currentCustomerId: CUSTOMER_ID,
      store: memory.store,
    })).resolves.toMatchObject({ kind: "callback_mismatch" });
    expect(completePayment).not.toHaveBeenCalled();
    const pendingPayment = await memory.store.read(CUSTOMER_ID);
    expect(pendingPayment).not.toBeNull();
    expect(canStartNewMobilePayment(pendingPayment)).toBe(false);
    expect(memory.storage.removeItem).not.toHaveBeenCalled();
  });

  test("does not trust raw provider errors as completion or delete the receipt", async () => {
    const memory = await preparePayment();
    const completePayment = jest.fn();

    const resolution = await completePendingPaymentCallback({
      callbackPaymentId: PAYMENT_ID,
      completePayment,
      currentCustomerId: CUSTOMER_ID,
      hasProviderError: true,
      store: memory.store,
    });

    expect(resolution).toMatchObject({ kind: "provider_error" });
    expect(resolution).not.toHaveProperty("error");
    expect(completePayment).not.toHaveBeenCalled();
    await expect(memory.store.read(CUSTOMER_ID)).resolves.not.toBeNull();
    expect(memory.storage.removeItem).not.toHaveBeenCalled();
  });

  test.each([
    [
      "pending",
      { status: 409, payload: { reason: "payment_not_paid", portoneStatus: "READY" } },
    ],
    ["retryable", { status: 404, payload: { error: "Payment transaction not found" } }],
    ["retryable", { status: 502, payload: { reason: "portone_lookup_failed" } }],
    [
      "manual_review",
      {
        status: 409,
        payload: { reason: "amount_or_currency_mismatch", portoneStatus: "PAID" },
      },
    ],
  ])("preserves an unresolved %s receipt for manual recheck", async (expectedKind, error) => {
    const memory = await preparePayment();

    await expect(completePendingPaymentCallback({
      callbackPaymentId: PAYMENT_ID,
      completePayment: jest.fn(async () => Promise.reject(error)),
      currentCustomerId: CUSTOMER_ID,
      store: memory.store,
    })).resolves.toMatchObject({ kind: expectedKind });
    const pendingPayment = await memory.store.read(CUSTOMER_ID);
    expect(pendingPayment).not.toBeNull();
    expect(canStartNewMobilePayment(pendingPayment)).toBe(false);
    expect(memory.storage.removeItem).not.toHaveBeenCalled();
  });

  test("keeps the original account receipt hidden and recoverable across account switches", async () => {
    const memory = await preparePayment();
    const completePayment = jest.fn();

    await expect(completePendingPaymentCallback({
      callbackPaymentId: PAYMENT_ID,
      completePayment,
      currentCustomerId: OTHER_CUSTOMER_ID,
      store: memory.store,
    })).resolves.toEqual({ kind: "missing", payment: null });
    expect(completePayment).not.toHaveBeenCalled();
    await expect(memory.store.read(CUSTOMER_ID)).resolves.toMatchObject({
      customerId: CUSTOMER_ID,
      paymentId: PAYMENT_ID,
    });
    expect(memory.storage.removeItem).not.toHaveBeenCalled();
  });

  test("preserves mismatched paid responses for manual review", async () => {
    const memory = await preparePayment();

    await expect(completePendingPaymentCallback({
      callbackPaymentId: PAYMENT_ID,
      completePayment: jest.fn(async () => paidResponse({ plan: "pro" })),
      currentCustomerId: CUSTOMER_ID,
      store: memory.store,
    })).resolves.toMatchObject({ kind: "manual_review" });
    await expect(memory.store.read(CUSTOMER_ID)).resolves.not.toBeNull();
    expect(memory.storage.removeItem).not.toHaveBeenCalled();
  });

  test.each(["CANCELLED", "FAILED"])(
    "clears only an authoritative provider %s response",
    async (portoneStatus) => {
      const memory = await preparePayment();

      await expect(completePendingPaymentCallback({
        callbackPaymentId: PAYMENT_ID,
        completePayment: jest.fn(async () => Promise.reject({
          status: 409,
          payload: { reason: "payment_not_paid", portoneStatus },
        })),
        currentCustomerId: CUSTOMER_ID,
        store: memory.store,
      })).resolves.toMatchObject({ kind: portoneStatus === "FAILED" ? "failed" : "cancelled" });
      await expect(memory.store.read(CUSTOMER_ID)).resolves.toBeNull();
      expect(memory.storage.removeItem).toHaveBeenCalledTimes(1);
    },
  );

  test("preserves the old account receipt if the active account changes during verification", async () => {
    const memory = await preparePayment();

    await expect(completePendingPaymentCallback({
      callbackPaymentId: PAYMENT_ID,
      completePayment: jest.fn(async () => paidResponse()),
      currentCustomerId: CUSTOMER_ID,
      isCustomerActive: () => false,
      store: memory.store,
    })).resolves.toMatchObject({ kind: "account_changed" });
    await expect(memory.store.read(CUSTOMER_ID)).resolves.not.toBeNull();
    expect(memory.storage.removeItem).not.toHaveBeenCalled();
  });
});
