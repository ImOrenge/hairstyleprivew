jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => "123e4567-e89b-42d3-a456-426614174000"),
}));
jest.mock("expo-device", () => ({ isDevice: true }));
jest.mock("expo-notifications", () => ({
  PermissionStatus: {
    GRANTED: "granted",
    DENIED: "denied",
    UNDETERMINED: "undetermined",
  },
  AndroidImportance: { HIGH: 4 },
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

// Module mocks must be installed before loading the Expo-dependent implementation.
// eslint-disable-next-line import/first
import {
  createPushInstallationStore,
  resolveGenerationPushTarget,
} from "../lib/push-notifications";

const generationId = "123e4567-e89b-42d3-a456-426614174000";

describe("generation push notification contracts", () => {
  test("accepts only the exact generation terminal target", () => {
    expect(
      resolveGenerationPushTarget({
        type: "generation_terminal",
        generationId,
        path: `/generate/${generationId}`,
      }),
    ).toEqual({
      target: { kind: "generation", generationId },
      path: `/generate/${generationId}`,
    });

    expect(
      resolveGenerationPushTarget({
        type: "generation_terminal",
        generationId,
        path: "https://evil.example/generate/anything",
      }),
    ).toBeNull();
    expect(
      resolveGenerationPushTarget({
        type: "marketing",
        generationId,
        path: `/generate/${generationId}`,
      }),
    ).toBeNull();
  });

  test("persists one installation id and an explicit opt-in preference", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: jest.fn(async (key: string) => values.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
    };
    const store = createPushInstallationStore(storage);

    await expect(store.getOrCreate()).resolves.toBe(generationId);
    await expect(store.getOrCreate()).resolves.toBe(generationId);
    await expect(store.readOptIn()).resolves.toBe(false);
    await store.setOptIn(true);
    await expect(store.readOptIn()).resolves.toBe(true);
    expect(storage.setItem).toHaveBeenCalledTimes(2);
  });
});
