import * as SecureStore from "expo-secure-store";

const LEGACY_GENERATION_DRAFT_RECEIPT_KEY = "hairfit.generation-draft-receipt.v1";
const GENERATION_DRAFT_RECEIPT_KEY_PREFIX = "hairfit.generation-draft-receipt.v2.";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OWNER_ID_PATTERN = /^[a-zA-Z0-9_-]{3,128}$/;

export interface MobileGenerationDraftReceipt {
  draftId: string;
  clientRequestId: string;
  uploadedAt: string;
  expiresAt: string;
}

interface OwnedGenerationDraftReceipt extends MobileGenerationDraftReceipt {
  version: 2;
  ownerId: string;
}

export interface GenerationRecoveryStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

function normalizeOwnerId(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return OWNER_ID_PATTERN.test(normalized) ? normalized : null;
}

function normalizeReceipt(
  value: unknown,
  expectedOwnerId: string,
  nowMs: number,
): OwnedGenerationDraftReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<OwnedGenerationDraftReceipt>;
  const uploadedAtMs = typeof record.uploadedAt === "string" ? Date.parse(record.uploadedAt) : NaN;
  const expiresAtMs = typeof record.expiresAt === "string" ? Date.parse(record.expiresAt) : NaN;

  if (
    record.version !== 2 ||
    record.ownerId !== expectedOwnerId ||
    typeof record.draftId !== "string" ||
    !UUID_PATTERN.test(record.draftId) ||
    typeof record.clientRequestId !== "string" ||
    !UUID_PATTERN.test(record.clientRequestId) ||
    !Number.isFinite(uploadedAtMs) ||
    !Number.isFinite(expiresAtMs) ||
    expiresAtMs <= nowMs
  ) {
    return null;
  }

  return {
    version: 2,
    ownerId: expectedOwnerId,
    draftId: record.draftId,
    clientRequestId: record.clientRequestId,
    uploadedAt: new Date(uploadedAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

function parseStoredReceipt(
  serialized: string | null,
  expectedOwnerId: string,
  nowMs: number,
) {
  if (!serialized) return null;
  try {
    return normalizeReceipt(JSON.parse(serialized), expectedOwnerId, nowMs);
  } catch {
    return null;
  }
}

export function getGenerationDraftReceiptStorageKey(ownerId: unknown) {
  const normalizedOwnerId = normalizeOwnerId(ownerId);
  return normalizedOwnerId
    ? `${GENERATION_DRAFT_RECEIPT_KEY_PREFIX}${normalizedOwnerId}`
    : null;
}

export function createEmptyGenerationFlowState(ownerId: string | null) {
  return {
    ownerId,
    imageDataUrl: null,
    draft: null,
    draftReceipt: null,
  };
}

export function canWriteGenerationFlowOwner(
  currentWritableOwnerId: string | null,
  callbackOwnerId: string | null,
) {
  return Boolean(callbackOwnerId && currentWritableOwnerId === callbackOwnerId);
}

const secureGenerationRecoveryStorage: GenerationRecoveryStorage = {
  async getItem(key) {
    if (!(await SecureStore.isAvailableAsync())) return null;
    return SecureStore.getItemAsync(key);
  },
  async setItem(key, value) {
    if (!(await SecureStore.isAvailableAsync())) {
      throw new Error("Secure generation recovery storage is unavailable");
    }
    await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key) {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.deleteItemAsync(key);
    }
  },
};

export function createGenerationRecoveryStore(storage: GenerationRecoveryStorage) {
  return {
    async save(
      expectedOwnerId: unknown,
      receipt: MobileGenerationDraftReceipt,
      nowMs = Date.now(),
    ) {
      const ownerId = normalizeOwnerId(expectedOwnerId);
      const storageKey = getGenerationDraftReceiptStorageKey(ownerId);
      if (!ownerId || !storageKey) {
        throw new Error("An authenticated generation owner is required");
      }

      const ownedReceipt = normalizeReceipt(
        { version: 2, ownerId, ...receipt },
        ownerId,
        nowMs,
      );
      if (!ownedReceipt) {
        throw new Error("Generation draft recovery data is invalid or expired");
      }

      await storage.setItem(storageKey, JSON.stringify(ownedReceipt));
      await storage.removeItem(LEGACY_GENERATION_DRAFT_RECEIPT_KEY);
      return receipt;
    },

    async read(expectedOwnerId: unknown, nowMs = Date.now()) {
      const ownerId = normalizeOwnerId(expectedOwnerId);
      const storageKey = getGenerationDraftReceiptStorageKey(ownerId);
      if (!ownerId || !storageKey) return null;

      const serialized = await storage.getItem(storageKey);
      const ownedReceipt = parseStoredReceipt(serialized, ownerId, nowMs);
      if (ownedReceipt) {
        await storage.removeItem(LEGACY_GENERATION_DRAFT_RECEIPT_KEY);
        const { version: _version, ownerId: _ownerId, ...receipt } = ownedReceipt;
        return receipt;
      }

      if (serialized !== null) {
        // Only the malformed value in the active account's namespace is removed.
        await storage.removeItem(storageKey);
      }
      // v1 data has no owner metadata and must never be guessed or migrated.
      await storage.removeItem(LEGACY_GENERATION_DRAFT_RECEIPT_KEY);
      return null;
    },

    async clear(expectedOwnerId: unknown) {
      const storageKey = getGenerationDraftReceiptStorageKey(expectedOwnerId);
      if (!storageKey) return false;
      await storage.removeItem(storageKey);
      await storage.removeItem(LEGACY_GENERATION_DRAFT_RECEIPT_KEY);
      return true;
    },
  };
}

export type GenerationRecoveryStore = ReturnType<typeof createGenerationRecoveryStore>;
export const generationRecoveryStore = createGenerationRecoveryStore(
  secureGenerationRecoveryStorage,
);
