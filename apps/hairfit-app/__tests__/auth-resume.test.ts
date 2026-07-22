import {
  AUTH_RESUME_WINDOW_MS,
  buildAuthRoute,
  consumeAuthResumePath,
  createPendingResumeStore,
  parseResumeTargetParam,
  resolveAuthResumePath,
  signOutAndClearAuthResume,
} from "../lib/auth-resume";
import { createGenerationResumeTarget, createSalonMatchResumeTarget } from "@hairfit/shared";

const generationId = "123e4567-e89b-42d3-a456-426614174000";
const legacyStorageKey = "hairfit.pending-resume-target.v1";
const storageKey = "hairfit.pending-resume-target.v2";

function createMemoryStorage(initialValues: Record<string, string> = {}) {
  const values = new Map(Object.entries(initialValues));

  return {
    storage: {
      getItem: jest.fn(async (key: string) => values.get(key) ?? null),
      setItem: jest.fn(async (key: string, nextValue: string) => {
        values.set(key, nextValue);
      }),
      removeItem: jest.fn(async (key: string) => {
        values.delete(key);
      }),
    },
    readValue: (key: string) => values.get(key) ?? null,
  };
}

describe("pending auth resume", () => {
  test("persists and restores only validated generation targets", async () => {
    const memory = createMemoryStorage();
    const store = createPendingResumeStore(memory.storage);
    const target = createGenerationResumeTarget(generationId);

    expect(target).not.toBeNull();
    await expect(store.save(target!, 1_000)).resolves.toBe(true);
    expect(JSON.parse(memory.readValue(storageKey)!)).toEqual({
      version: 2,
      target: `generation:${generationId}`,
      createdAt: new Date(1_000).toISOString(),
    });
    await expect(store.read(1_000)).resolves.toEqual(target);
  });

  test("removes malformed persisted values instead of navigating to them", async () => {
    const memory = createMemoryStorage({
      [storageKey]: "https://evil.example/generate/anything",
    });
    const store = createPendingResumeStore(memory.storage);

    await expect(store.read()).resolves.toBeNull();
    expect(memory.readValue(storageKey)).toBeNull();
    expect(memory.readValue(legacyStorageKey)).toBeNull();
  });

  test("expires stale resume targets and rejects future-dated envelopes", async () => {
    const staleMemory = createMemoryStorage();
    const staleStore = createPendingResumeStore(staleMemory.storage);
    const target = createGenerationResumeTarget(generationId)!;

    await staleStore.save(target, 1_000);
    await expect(staleStore.read(1_000 + AUTH_RESUME_WINDOW_MS + 1)).resolves.toBeNull();
    expect(staleMemory.readValue(storageKey)).toBeNull();

    const futureMemory = createMemoryStorage();
    const futureStore = createPendingResumeStore(futureMemory.storage);
    await futureStore.save(target, 120_001);
    await expect(futureStore.read(1_000)).resolves.toBeNull();
    expect(futureMemory.readValue(storageKey)).toBeNull();
  });

  test("migrates a validated v1 target into the expiring v2 envelope", async () => {
    const memory = createMemoryStorage({
      [legacyStorageKey]: `generation:${generationId}`,
    });
    const store = createPendingResumeStore(memory.storage);

    await expect(store.read(1_000)).resolves.toEqual(createGenerationResumeTarget(generationId));
    expect(memory.readValue(legacyStorageKey)).toBeNull();
    expect(JSON.parse(memory.readValue(storageKey)!)).toMatchObject({
      version: 2,
      target: `generation:${generationId}`,
    });
  });

  test("preserves the same target while switching login and signup", () => {
    const target = createGenerationResumeTarget(generationId);
    const serialized = `generation:${generationId}`;

    expect(parseResumeTargetParam([serialized, "ignored"])).toEqual(target);
    expect(buildAuthRoute("/login", target)).toBe(`/login?resume=${encodeURIComponent(serialized)}`);
    expect(buildAuthRoute("/signup", target)).toBe(`/signup?resume=${encodeURIComponent(serialized)}`);
    expect(buildAuthRoute("/login", null)).toBe("/login");
  });

  test("restores the persisted generation after auth and consumes it once", async () => {
    const memory = createMemoryStorage();
    const store = createPendingResumeStore(memory.storage);
    const target = createGenerationResumeTarget(generationId);

    await store.save(target!);
    await expect(resolveAuthResumePath(undefined, store)).resolves.toBe(`/generate/${generationId}`);
    await expect(consumeAuthResumePath(undefined, store)).resolves.toBe(`/generate/${generationId}`);
    expect(memory.readValue(storageKey)).toBeNull();
    expect(memory.readValue(legacyStorageKey)).toBeNull();
    await expect(store.read()).resolves.toBeNull();
  });

  test("preserves a salon invite across authentication and consumes it once", async () => {
    const memory = createMemoryStorage();
    const store = createPendingResumeStore(memory.storage);
    const inviteCode = "a1b2c3d4e5f60718293a4b5c";
    const target = createSalonMatchResumeTarget(inviteCode);

    expect(target).not.toBeNull();
    await store.save(target!);
    await expect(resolveAuthResumePath(undefined, store)).resolves.toBe(`/salon/match/${inviteCode}`);
    await expect(consumeAuthResumePath(undefined, store)).resolves.toBe(`/salon/match/${inviteCode}`);
    expect(memory.readValue(storageKey)).toBeNull();
    expect(memory.readValue(legacyStorageKey)).toBeNull();
    await expect(store.read()).resolves.toBeNull();
  });

  test("explicit account logout clears stale auth resume state only after session closure", async () => {
    const order: string[] = [];
    const signOut = jest.fn(async () => {
      order.push("sign-out");
    });
    const store = {
      save: jest.fn(),
      read: jest.fn(),
      clear: jest.fn(async () => {
        order.push("clear-resume");
      }),
    } as unknown as ReturnType<typeof createPendingResumeStore>;

    await signOutAndClearAuthResume(signOut, store);
    expect(order).toEqual(["sign-out", "clear-resume"]);

    store.clear = jest.fn();
    await expect(
      signOutAndClearAuthResume(async () => {
        throw new Error("session close failed");
      }, store),
    ).rejects.toThrow("session close failed");
    expect(store.clear).not.toHaveBeenCalled();
  });
});
