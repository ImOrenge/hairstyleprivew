import {
  createGenerationResumeTarget,
  createSalonMatchResumeTarget,
  parseResumeTarget,
  resumeTargetToPath,
  serializeResumeTarget,
  type ResumeTargetPath,
  type ResumeTarget,
} from "@hairfit/shared";
import * as SecureStore from "expo-secure-store";

const LEGACY_PENDING_RESUME_STORAGE_KEY = "hairfit.pending-resume-target.v1";
const PENDING_RESUME_STORAGE_KEY = "hairfit.pending-resume-target.v2";
const MAX_FUTURE_CLOCK_SKEW_MS = 60 * 1000;

export const AUTH_RESUME_WINDOW_MS = 24 * 60 * 60 * 1000;

export type AuthRoutePath = "/login" | "/signup" | "/forgot-password";
export type AuthResumePath = "/" | ResumeTargetPath;
export type ResumeSearchParam = string | string[] | null | undefined;

export interface PendingResumeStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

function getBrowserStorage() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

const memoryFallback = new Map<string, string>();

const devicePendingResumeStorage: PendingResumeStorage = {
  async getItem(key) {
    try {
      if (await SecureStore.isAvailableAsync()) {
        const stored = await SecureStore.getItemAsync(key);
        if (stored !== null) return stored;
      }
    } catch {
      // Fall through to browser or in-memory storage when the platform store is unavailable.
    }

    try {
      const stored = getBrowserStorage()?.getItem(key) ?? null;
      if (stored !== null) return stored;
    } catch {
      // The in-memory value still preserves navigation within the current process.
    }

    return memoryFallback.get(key) ?? null;
  },
  async setItem(key, value) {
    memoryFallback.set(key, value);

    try {
      if (await SecureStore.isAvailableAsync()) {
        await SecureStore.setItemAsync(key, value);
        return;
      }
    } catch {
      // Fall through to browser storage.
    }

    try {
      getBrowserStorage()?.setItem(key, value);
    } catch {
      // The in-memory fallback remains available for this process.
    }
  },
  async removeItem(key) {
    memoryFallback.delete(key);

    try {
      if (await SecureStore.isAvailableAsync()) {
        await SecureStore.deleteItemAsync(key);
      }
    } catch {
      // Continue clearing other storage surfaces.
    }

    try {
      getBrowserStorage()?.removeItem(key);
    } catch {
      // Nothing else to clear.
    }
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStoredResumeEnvelope(serialized: string | null, nowMs: number) {
  if (!serialized || !Number.isFinite(nowMs)) return null;

  try {
    const value: unknown = JSON.parse(serialized);
    if (!isRecord(value) || value.version !== 2) return null;
    const target = parseResumeTarget(value.target);
    const createdAtMs = typeof value.createdAt === "string" ? Date.parse(value.createdAt) : NaN;
    if (
      !target ||
      !Number.isFinite(createdAtMs) ||
      createdAtMs > nowMs + MAX_FUTURE_CLOCK_SKEW_MS ||
      nowMs - createdAtMs > AUTH_RESUME_WINDOW_MS
    ) {
      return null;
    }
    return target;
  } catch {
    return null;
  }
}

export function createPendingResumeStore(storage: PendingResumeStorage) {
  async function save(target: ResumeTarget, nowMs = Date.now()) {
    const serialized = serializeResumeTarget(target);
    if (!serialized || !Number.isFinite(nowMs)) return false;
    await storage.setItem(PENDING_RESUME_STORAGE_KEY, JSON.stringify({
      version: 2,
      target: serialized,
      createdAt: new Date(nowMs).toISOString(),
    }));
    await storage.removeItem(LEGACY_PENDING_RESUME_STORAGE_KEY);
    return true;
  }

  async function read(nowMs = Date.now()) {
    const serialized = await storage.getItem(PENDING_RESUME_STORAGE_KEY);
    const target = parseStoredResumeEnvelope(serialized, nowMs);
    if (target) return target;
    if (serialized !== null) {
      await storage.removeItem(PENDING_RESUME_STORAGE_KEY);
    }

    const legacySerialized = await storage.getItem(LEGACY_PENDING_RESUME_STORAGE_KEY);
    const legacyTarget = parseResumeTarget(legacySerialized);
    if (legacyTarget) {
      await save(legacyTarget, nowMs);
      return legacyTarget;
    }
    if (legacySerialized !== null) {
      await storage.removeItem(LEGACY_PENDING_RESUME_STORAGE_KEY);
    }
    return null;
  }

  async function clear() {
    await storage.removeItem(PENDING_RESUME_STORAGE_KEY);
    await storage.removeItem(LEGACY_PENDING_RESUME_STORAGE_KEY);
  }

  return {
    save,
    read,
    clear,
  };
}

export type PendingResumeStore = ReturnType<typeof createPendingResumeStore>;

export const pendingResumeStore = createPendingResumeStore(devicePendingResumeStorage);

export async function signOutAndClearAuthResume(
  signOut: () => Promise<unknown>,
  store: PendingResumeStore = pendingResumeStore,
) {
  await signOut();
  await store.clear();
}

function firstSearchParam(value: ResumeSearchParam) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseResumeTargetParam(value: ResumeSearchParam) {
  return parseResumeTarget(firstSearchParam(value));
}

export function buildAuthRoute(path: AuthRoutePath, target: ResumeTarget | null | undefined) {
  const serialized = serializeResumeTarget(target);
  return serialized ? `${path}?resume=${encodeURIComponent(serialized)}` : path;
}

export async function saveGenerationResumeTarget(generationId: unknown) {
  const target = createGenerationResumeTarget(generationId);
  if (!target) return null;
  await pendingResumeStore.save(target);
  return target;
}

export async function saveSalonMatchResumeTarget(inviteCode: unknown) {
  const target = createSalonMatchResumeTarget(inviteCode);
  if (!target) return null;
  await pendingResumeStore.save(target);
  return target;
}

export async function resolveAuthResumeTarget(
  value?: ResumeSearchParam,
  store: PendingResumeStore = pendingResumeStore,
) {
  return parseResumeTargetParam(value) ?? store.read();
}

export async function resolveAuthResumePath(
  value?: ResumeSearchParam,
  store: PendingResumeStore = pendingResumeStore,
): Promise<AuthResumePath> {
  const target = await resolveAuthResumeTarget(value, store);
  return resumeTargetToPath(target) ?? "/";
}

export async function consumeAuthResumePath(
  value?: ResumeSearchParam,
  store: PendingResumeStore = pendingResumeStore,
): Promise<AuthResumePath> {
  const path = await resolveAuthResumePath(value, store);
  await store.clear();
  return path;
}
