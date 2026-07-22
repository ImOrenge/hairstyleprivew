import {
  DEFAULT_PAYMENT_RETURN_TO,
  PAYMENT_AUTO_RESUME_WINDOW_MS,
  canStartNewMobilePayment,
  classifyPaymentCompletionError,
  createPaymentResumeStore,
  isMatchingPaidCompletion,
  isPaymentAutoResumeEligible,
  normalizePaymentResumePaymentId,
  normalizePaymentResumeReturnTo,
  type PaymentResumeStorage,
} from "../lib/payment-resume";

const NOW = Date.parse("2026-07-15T12:00:00.000Z");
const PAYMENT_ID = "mob-s-mdeswabc-123456789abc";
const CUSTOMER_ID = "user_hairfit_owner";
const OTHER_CUSTOMER_ID = "user_other_account";
const LEGACY_STORAGE_KEY = "hairfit.pending-mobile-payment.v1";
const V2_STORAGE_KEY_PREFIX = "hairfit.pending-mobile-payment.v2.";

function createMemoryStorage() {
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
    values,
    seed(key: string, value: string) {
      values.set(key, value);
    },
    replaceCustomerValue(customerId: string, value: string) {
      values.set(`${V2_STORAGE_KEY_PREFIX}${customerId}`, value);
    },
    readCustomerValue(customerId: string) {
      return values.get(`${V2_STORAGE_KEY_PREFIX}${customerId}`) ?? null;
    },
  };
}

function preparedPayment(
  customerId = CUSTOMER_ID,
  paymentId = PAYMENT_ID,
  plan: "basic" | "standard" | "pro" = "standard",
) {
  return { paymentId, customerId, plan };
}

describe("mobile payment resume", () => {
  test("stores a v2 account-scoped receipt and only an allowed return target", async () => {
    const memory = createMemoryStorage();
    const store = createPaymentResumeStore(memory.storage);

    const pending = await store.save(preparedPayment(), "/generate", CUSTOMER_ID, NOW);

    expect(pending).toEqual({
      version: 2,
      paymentId: PAYMENT_ID,
      customerId: CUSTOMER_ID,
      plan: "standard",
      createdAt: "2026-07-15T12:00:00.000Z",
      returnTo: "/generate",
    });
    await expect(store.read(CUSTOMER_ID)).resolves.toEqual(pending);
    expect(isPaymentAutoResumeEligible(pending, NOW)).toBe(true);
    expect(normalizePaymentResumeReturnTo("https://evil.example/generate"))
      .toBe(DEFAULT_PAYMENT_RETURN_TO);
  });

  test("preserves only a canonical result return target with a safe variant", async () => {
    const memory = createMemoryStorage();
    const store = createPaymentResumeStore(memory.storage);
    const resultReturnTo =
      "/result/8C4C76B5-D91D-4D8A-BB0D-1A720E9D9882?variant=soft-layered_bob-01";

    const pending = await store.save(preparedPayment(), resultReturnTo, CUSTOMER_ID, NOW);

    expect(pending.returnTo).toBe(
      "/result/8c4c76b5-d91d-4d8a-bb0d-1a720e9d9882?variant=soft-layered_bob-01",
    );
    await expect(store.read(CUSTOMER_ID)).resolves.toEqual(pending);
  });

  test("preserves only a canonical styler session return target", async () => {
    const memory = createMemoryStorage();
    const store = createPaymentResumeStore(memory.storage);

    const pending = await store.save(
      preparedPayment(),
      "/styler/8C4C76B5-D91D-4D8A-BB0D-1A720E9D9882",
      CUSTOMER_ID,
      NOW,
    );

    expect(pending.returnTo).toBe("/styler/8c4c76b5-d91d-4d8a-bb0d-1a720e9d9882");
    await expect(store.read(CUSTOMER_ID)).resolves.toEqual(pending);
  });

  test.each([
    "//evil.example/styler/8c4c76b5-d91d-4d8a-bb0d-1a720e9d9882",
    "/styler/not-a-uuid",
    "/styler/8c4c76b5-d91d-4d8a-bb0d-1a720e9d9882?next=/admin",
    "/styler/8c4c76b5-d91d-4d8a-bb0d-1a720e9d9882#admin",
    "/styler/8c4c76b5-d91d-4d8a-bb0d-1a720e9d9882/extra",
  ])("rejects an unsafe styler return target: %s", (returnTo) => {
    expect(normalizePaymentResumeReturnTo(returnTo)).toBe(DEFAULT_PAYMENT_RETURN_TO);
  });

  test.each([
    "//evil.example/result/8c4c76b5-d91d-4d8a-bb0d-1a720e9d9882?variant=soft-bob",
    "/result/not-a-uuid?variant=soft-bob",
    "/result/8c4c76b5-d91d-4d8a-bb0d-1a720e9d9882?variant=../admin",
    "/result/8c4c76b5-d91d-4d8a-bb0d-1a720e9d9882?variant=soft-bob&variant=other",
    "/result/8c4c76b5-d91d-4d8a-bb0d-1a720e9d9882?variant=soft-bob&next=/admin",
    "/result/8c4c76b5-d91d-4d8a-bb0d-1a720e9d9882?variant=soft-bob#admin",
  ])("rejects an unsafe result return target: %s", (returnTo) => {
    expect(normalizePaymentResumeReturnTo(returnTo)).toBe(DEFAULT_PAYMENT_RETURN_TO);
  });

  test("falls back to mypage when the persisted return target was tampered", async () => {
    const memory = createMemoryStorage();
    const store = createPaymentResumeStore(memory.storage);
    await store.save(preparedPayment(), "/generate", CUSTOMER_ID, NOW);
    memory.replaceCustomerValue(CUSTOMER_ID, JSON.stringify({
      version: 2,
      paymentId: PAYMENT_ID,
      customerId: CUSTOMER_ID,
      plan: "standard",
      createdAt: new Date(NOW).toISOString(),
      returnTo: "/admin",
    }));

    await expect(store.read(CUSTOMER_ID)).resolves.toMatchObject({
      paymentId: PAYMENT_ID,
      returnTo: DEFAULT_PAYMENT_RETURN_TO,
    });
  });

  test("preserves each account receipt across account switches and switch-back", async () => {
    const memory = createMemoryStorage();
    const store = createPaymentResumeStore(memory.storage);
    const ownerPayment = await store.save(preparedPayment(), "/generate", CUSTOMER_ID, NOW);

    await expect(store.read(OTHER_CUSTOMER_ID)).resolves.toBeNull();
    expect(memory.readCustomerValue(CUSTOMER_ID)).not.toBeNull();
    await expect(store.read(CUSTOMER_ID)).resolves.toEqual(ownerPayment);

    const otherPayment = await store.save(
      preparedPayment(OTHER_CUSTOMER_ID, "mob-b-mdeswnew-abcdef123456", "basic"),
      DEFAULT_PAYMENT_RETURN_TO,
      OTHER_CUSTOMER_ID,
      NOW + 1,
    );
    await expect(store.read(OTHER_CUSTOMER_ID)).resolves.toEqual(otherPayment);
    await expect(store.read(CUSTOMER_ID)).resolves.toEqual(ownerPayment);
    expect(memory.storage.removeItem).not.toHaveBeenCalled();
  });

  test("does not delete another owner's legacy receipt before its owner migrates it", async () => {
    const memory = createMemoryStorage();
    const store = createPaymentResumeStore(memory.storage);
    memory.seed(LEGACY_STORAGE_KEY, JSON.stringify({
      version: 1,
      paymentId: PAYMENT_ID,
      customerId: CUSTOMER_ID,
      plan: "standard",
      createdAt: new Date(NOW).toISOString(),
      returnTo: "/generate",
    }));

    await expect(store.read(OTHER_CUSTOMER_ID)).resolves.toBeNull();
    expect(memory.values.has(LEGACY_STORAGE_KEY)).toBe(true);
    await expect(store.read(CUSTOMER_ID)).resolves.toMatchObject({
      version: 2,
      customerId: CUSTOMER_ID,
      paymentId: PAYMENT_ID,
    });
    expect(memory.values.has(LEGACY_STORAGE_KEY)).toBe(false);
    expect(memory.readCustomerValue(CUSTOMER_ID)).not.toBeNull();
  });

  test("rejects a prepared payment whose customer does not match the active account", async () => {
    const memory = createMemoryStorage();
    const store = createPaymentResumeStore(memory.storage);

    await expect(store.save(
      preparedPayment(),
      "/generate",
      OTHER_CUSTOMER_ID,
      NOW,
    )).rejects.toThrow("current user");
    expect(memory.storage.setItem).not.toHaveBeenCalled();
  });

  test("removes malformed data only from the current account namespace", async () => {
    const malformedValues = [
      "not-json",
      JSON.stringify({
        version: 1,
        paymentId: PAYMENT_ID,
        customerId: CUSTOMER_ID,
        plan: "standard",
        createdAt: new Date(NOW).toISOString(),
        returnTo: "/generate",
      }),
      JSON.stringify({
        version: 2,
        paymentId: "arbitrary-payment",
        customerId: CUSTOMER_ID,
        plan: "standard",
        createdAt: new Date(NOW).toISOString(),
        returnTo: "/generate",
      }),
      JSON.stringify({
        version: 2,
        paymentId: PAYMENT_ID,
        customerId: "invalid customer id",
        plan: "standard",
        createdAt: new Date(NOW).toISOString(),
        returnTo: "/generate",
      }),
      JSON.stringify({
        version: 2,
        paymentId: PAYMENT_ID,
        customerId: CUSTOMER_ID,
        plan: "enterprise",
        createdAt: new Date(NOW).toISOString(),
        returnTo: "/generate",
      }),
    ];

    for (const serialized of malformedValues) {
      const memory = createMemoryStorage();
      const store = createPaymentResumeStore(memory.storage);
      await store.save(preparedPayment(), "/generate", CUSTOMER_ID, NOW);
      await store.save(
        preparedPayment(OTHER_CUSTOMER_ID, "mob-b-mdeswnew-abcdef123456", "basic"),
        DEFAULT_PAYMENT_RETURN_TO,
        OTHER_CUSTOMER_ID,
        NOW,
      );
      memory.replaceCustomerValue(CUSTOMER_ID, serialized);

      await expect(store.read(CUSTOMER_ID)).resolves.toBeNull();
      expect(memory.readCustomerValue(CUSTOMER_ID)).toBeNull();
      expect(memory.readCustomerValue(OTHER_CUSTOMER_ID)).not.toBeNull();
    }
  });

  test("keeps stale receipts but disables automatic resume and new purchases", async () => {
    const memory = createMemoryStorage();
    const store = createPaymentResumeStore(memory.storage);
    const stale = await store.save(
      preparedPayment(),
      "/generate",
      CUSTOMER_ID,
      NOW - PAYMENT_AUTO_RESUME_WINDOW_MS,
    );

    await expect(store.read(CUSTOMER_ID)).resolves.toEqual(stale);
    expect(isPaymentAutoResumeEligible(stale, NOW)).toBe(false);
    expect(canStartNewMobilePayment(stale)).toBe(false);
    expect(memory.readCustomerValue(CUSTOMER_ID)).not.toBeNull();
    expect(memory.storage.removeItem).not.toHaveBeenCalled();
  });

  test("treats a large future clock shift as manual review without deleting the receipt", async () => {
    const memory = createMemoryStorage();
    const store = createPaymentResumeStore(memory.storage);
    const future = await store.save(preparedPayment(), "/generate", CUSTOMER_ID, NOW + 120_000);

    await expect(store.read(CUSTOMER_ID)).resolves.toEqual(future);
    expect(isPaymentAutoResumeEligible(future, NOW)).toBe(false);
    expect(memory.readCustomerValue(CUSTOMER_ID)).not.toBeNull();
  });

  test("an old completion cannot clear a newer receipt or another account", async () => {
    const memory = createMemoryStorage();
    const store = createPaymentResumeStore(memory.storage);
    await store.save(preparedPayment(), "/generate", CUSTOMER_ID, NOW);
    const newer = await store.save(
      preparedPayment(CUSTOMER_ID, "mob-p-mdeswxyz-abcdef123456", "pro"),
      DEFAULT_PAYMENT_RETURN_TO,
      CUSTOMER_ID,
      NOW + 1,
    );
    const other = await store.save(
      preparedPayment(OTHER_CUSTOMER_ID, "mob-b-mdeswnew-abcdef123456", "basic"),
      DEFAULT_PAYMENT_RETURN_TO,
      OTHER_CUSTOMER_ID,
      NOW + 1,
    );

    await expect(store.clear(CUSTOMER_ID, PAYMENT_ID)).resolves.toBe(false);
    await expect(store.read(CUSTOMER_ID)).resolves.toEqual(newer);
    await expect(store.read(OTHER_CUSTOMER_ID)).resolves.toEqual(other);
  });

  test("purges only the deleted account receipt even when its value is malformed", async () => {
    const memory = createMemoryStorage();
    const store = createPaymentResumeStore(memory.storage);
    memory.replaceCustomerValue(CUSTOMER_ID, "malformed-account-receipt");
    const other = await store.save(
      preparedPayment(OTHER_CUSTOMER_ID, "mob-b-mdeswnew-abcdef123456", "basic"),
      DEFAULT_PAYMENT_RETURN_TO,
      OTHER_CUSTOMER_ID,
      NOW,
    );

    await expect(store.purge(CUSTOMER_ID)).resolves.toBe(true);
    expect(memory.readCustomerValue(CUSTOMER_ID)).toBeNull();
    await expect(store.read(OTHER_CUSTOMER_ID)).resolves.toEqual(other);
  });

  test("clears only authoritative terminal states and escalates paid mismatches", () => {
    expect(classifyPaymentCompletionError({
      status: 409,
      payload: { reason: "payment_not_paid", portoneStatus: "READY" },
    })).toBe("pending");
    expect(classifyPaymentCompletionError({
      status: 409,
      payload: { reason: "payment_not_paid", portoneStatus: "CANCELLED" },
    })).toBe("cancelled");
    expect(classifyPaymentCompletionError({
      status: 409,
      payload: { reason: "payment_not_paid", portoneStatus: "FAILED" },
    })).toBe("failed");
    expect(classifyPaymentCompletionError({
      status: 404,
      payload: { error: "Payment transaction not found" },
    })).toBe("retryable");
    expect(classifyPaymentCompletionError({
      status: 502,
      payload: { reason: "portone_lookup_failed" },
    })).toBe("retryable");
    expect(classifyPaymentCompletionError({
      status: 409,
      payload: {
        reason: "amount_or_currency_mismatch",
        portoneStatus: "PAID",
      },
    })).toBe("manual_review");
    expect(classifyPaymentCompletionError({
      status: 409,
      payload: { error: "Payment transaction metadata mismatch" },
    })).toBe("manual_review");
    expect(classifyPaymentCompletionError({
      status: 409,
      payload: { reason: "payment_not_paid", portoneStatus: "PARTIAL_CANCELLED" },
    })).toBe("manual_review");
  });

  test("accepts paid completion only when payment and plan match the stored receipt", async () => {
    const store = createPaymentResumeStore(createMemoryStorage().storage);
    const pending = await store.save(preparedPayment(), "/generate", CUSTOMER_ID, NOW);
    const result = {
      ok: true,
      status: "paid",
      paymentId: PAYMENT_ID,
      plan: "standard",
      transactionId: "transaction-id",
      creditsGranted: 200,
      ledgerId: "ledger-id",
    };

    expect(isMatchingPaidCompletion(result, pending)).toBe(true);
    expect(isMatchingPaidCompletion({ ...result, paymentId: "mob-s-other-123456789abc" }, pending))
      .toBe(false);
    expect(isMatchingPaidCompletion({ ...result, plan: "pro" }, pending)).toBe(false);
  });

  test("normalizes only valid mobile payment callback IDs", () => {
    expect(normalizePaymentResumePaymentId(PAYMENT_ID)).toBe(PAYMENT_ID);
    expect(normalizePaymentResumePaymentId([PAYMENT_ID])).toBeNull();
    expect(normalizePaymentResumePaymentId("https://evil.example/payment")).toBeNull();
  });
});
