const DB_NAME = "hairfit-local-cache";
const STORE_NAME = "uploads";
const LEGACY_ORIGINAL_IMAGE_KEY = "original-image";
const ORIGINAL_IMAGE_KEY_PREFIX = "original-image.v2.";

interface CachedOriginalImageRecord {
  version: 2;
  ownerId: string;
  image: Blob;
  savedAt: string;
}

function normalizeOwnerId(ownerId: string) {
  const normalized = ownerId.trim();
  if (!/^[a-zA-Z0-9_-]{3,128}$/.test(normalized)) {
    throw new Error("A valid authenticated owner is required for the image cache");
  }
  return normalized;
}

export function getOriginalImageCacheKey(ownerId: string) {
  return `${ORIGINAL_IMAGE_KEY_PREFIX}${normalizeOwnerId(ownerId)}`;
}

export function readOwnedOriginalImageRecord(value: unknown, expectedOwnerId: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Partial<CachedOriginalImageRecord>;
  return record.version === 2 &&
    record.ownerId === normalizeOwnerId(expectedOwnerId) &&
    typeof Blob !== "undefined" &&
    record.image instanceof Blob
    ? record.image
    : null;
}

function isBrowserEnvironment() {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!isBrowserEnvironment()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const request = window.indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function saveOriginalImageToCache(ownerId: string, file: File) {
  const db = await openDatabase();
  if (!db) {
    return;
  }

  const normalizedOwnerId = normalizeOwnerId(ownerId);

  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    store.put(
      {
        version: 2,
        ownerId: normalizedOwnerId,
        image: file,
        savedAt: new Date().toISOString(),
      } satisfies CachedOriginalImageRecord,
      getOriginalImageCacheKey(normalizedOwnerId),
    );
    // A v1 entry has no authenticated owner and therefore cannot be migrated
    // without risking cross-account disclosure.
    store.delete(LEGACY_ORIGINAL_IMAGE_KEY);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      resolve();
    };
    transaction.onabort = () => {
      db.close();
      resolve();
    };
  });
}

export async function readOriginalImageFromCache(ownerId: string): Promise<File | null> {
  const db = await openDatabase();
  if (!db) {
    return null;
  }

  const normalizedOwnerId = normalizeOwnerId(ownerId);

  return await new Promise<File | null>((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(getOriginalImageCacheKey(normalizedOwnerId));
    store.delete(LEGACY_ORIGINAL_IMAGE_KEY);

    request.onsuccess = () => {
      const result = readOwnedOriginalImageRecord(request.result, normalizedOwnerId);
      db.close();

      if (typeof File !== "undefined" && result instanceof File) {
        resolve(result);
        return;
      }

      if (result instanceof Blob) {
        resolve(new File([result], "uploaded-image", { type: result.type || "image/jpeg" }));
        return;
      }

      resolve(null);
    };

    request.onerror = () => {
      db.close();
      resolve(null);
    };
  });
}

export async function clearOriginalImageCache(ownerId: string) {
  const db = await openDatabase();
  if (!db) {
    return;
  }

  const normalizedOwnerId = normalizeOwnerId(ownerId);

  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    store.delete(getOriginalImageCacheKey(normalizedOwnerId));
    store.delete(LEGACY_ORIGINAL_IMAGE_KEY);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      resolve();
    };
    transaction.onabort = () => {
      db.close();
      resolve();
    };
  });
}
