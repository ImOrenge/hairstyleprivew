import {
  canWriteGenerationFlowOwner,
  createEmptyGenerationFlowState,
  createGenerationRecoveryStore,
  getGenerationDraftReceiptStorageKey,
  type GenerationRecoveryStorage,
  type MobileGenerationDraftReceipt,
} from "../lib/generation-recovery";

const NOW = Date.parse("2026-07-15T12:00:00.000Z");
const ACCOUNT_A = "user_account_a";
const ACCOUNT_B = "user_account_b";
const LEGACY_KEY = "hairfit.generation-draft-receipt.v1";

function receipt(seed: "a" | "b"): MobileGenerationDraftReceipt {
  return {
    draftId: seed === "a"
      ? "8c4c76b5-d91d-4d8a-bb0d-1a720e9d9882"
      : "b6eb2e45-75c9-4b4b-8bd8-a55d7a47cbbb",
    clientRequestId: seed === "a"
      ? "5c7baf42-e536-4ba6-8d57-5cb9a3e8c8e2"
      : "ca9b89fd-f222-46fb-9721-6ea0de6f1127",
    uploadedAt: "2026-07-15T11:59:00.000Z",
    expiresAt: "2026-07-15T12:30:00.000Z",
  };
}

function createMemoryStorage() {
  const values = new Map<string, string>();
  const storage: GenerationRecoveryStorage = {
    getItem: jest.fn(async (key) => values.get(key) ?? null),
    setItem: jest.fn(async (key, value) => {
      values.set(key, value);
    }),
    removeItem: jest.fn(async (key) => {
      values.delete(key);
    }),
  };
  return { storage, values };
}

describe("account-bound generation recovery", () => {
  test("account B cannot read account A's draft receipt", async () => {
    const memory = createMemoryStorage();
    const store = createGenerationRecoveryStore(memory.storage);
    const accountAReceipt = receipt("a");

    await store.save(ACCOUNT_A, accountAReceipt, NOW);

    await expect(store.read(ACCOUNT_B, NOW)).resolves.toBeNull();
    await expect(store.read(ACCOUNT_A, NOW)).resolves.toEqual(accountAReceipt);
    expect(getGenerationDraftReceiptStorageKey(ACCOUNT_A)).not.toBe(
      getGenerationDraftReceiptStorageKey(ACCOUNT_B),
    );
  });

  test("preserves independent receipts when switching away and back", async () => {
    const memory = createMemoryStorage();
    const store = createGenerationRecoveryStore(memory.storage);

    await store.save(ACCOUNT_A, receipt("a"), NOW);
    await store.save(ACCOUNT_B, receipt("b"), NOW);

    await expect(store.read(ACCOUNT_B, NOW)).resolves.toEqual(receipt("b"));
    await expect(store.read(ACCOUNT_A, NOW)).resolves.toEqual(receipt("a"));
  });

  test("persists only the recovery receipt even when an unsafe caller adds portrait data", async () => {
    const memory = createMemoryStorage();
    const store = createGenerationRecoveryStore(memory.storage);
    const privateImageDataUrl = "data:image/jpeg;base64,PRIVATE_PORTRAIT_SENTINEL";
    const unsafeReceipt = {
      ...receipt("a"),
      imageDataUrl: privateImageDataUrl,
      referenceImageDataUrl: privateImageDataUrl,
    };

    await store.save(ACCOUNT_A, unsafeReceipt, NOW);

    const stored = memory.values.get(getGenerationDraftReceiptStorageKey(ACCOUNT_A)!);
    expect(stored).toBeDefined();
    expect(stored).not.toContain("base64");
    expect(stored).not.toContain("PRIVATE_PORTRAIT_SENTINEL");
    expect(JSON.parse(stored!)).toEqual({
      version: 2,
      ownerId: ACCOUNT_A,
      ...receipt("a"),
    });
  });

  test("rejects owner metadata tampering without touching another account", async () => {
    const memory = createMemoryStorage();
    const store = createGenerationRecoveryStore(memory.storage);
    await store.save(ACCOUNT_A, receipt("a"), NOW);
    await store.save(ACCOUNT_B, receipt("b"), NOW);

    const accountAKey = getGenerationDraftReceiptStorageKey(ACCOUNT_A)!;
    memory.values.set(accountAKey, JSON.stringify({
      version: 2,
      ownerId: ACCOUNT_B,
      ...receipt("a"),
    }));

    await expect(store.read(ACCOUNT_A, NOW)).resolves.toBeNull();
    await expect(store.read(ACCOUNT_B, NOW)).resolves.toEqual(receipt("b"));
  });

  test("never exposes an unowned legacy receipt", async () => {
    const memory = createMemoryStorage();
    const store = createGenerationRecoveryStore(memory.storage);
    memory.values.set(LEGACY_KEY, JSON.stringify(receipt("a")));

    await expect(store.read(ACCOUNT_B, NOW)).resolves.toBeNull();
    expect(memory.values.has(LEGACY_KEY)).toBe(false);
  });

  test("auth transitions clear every in-memory recovery field", () => {
    expect(createEmptyGenerationFlowState(ACCOUNT_B)).toEqual({
      ownerId: ACCOUNT_B,
      imageDataUrl: null,
      draft: null,
      draftReceipt: null,
    });
  });

  test("a stale account A setter cannot write after account B finishes binding", () => {
    const setterCapturedOwner = ACCOUNT_A;
    const currentWritableOwner = ACCOUNT_B;

    expect(canWriteGenerationFlowOwner(currentWritableOwner, setterCapturedOwner)).toBe(false);
    expect(canWriteGenerationFlowOwner(currentWritableOwner, ACCOUNT_B)).toBe(true);
  });
});
