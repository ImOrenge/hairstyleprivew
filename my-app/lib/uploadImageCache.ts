const DB_NAME = "hairfit-local-cache";
const STORE_NAME = "uploads";
const ORIGINAL_IMAGE_KEY = "original-image";

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

export async function saveOriginalImageToCache(file: File) {
  const db = await openDatabase();
  if (!db) {
    return;
  }

  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    store.put(file, ORIGINAL_IMAGE_KEY);

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

export async function readOriginalImageFromCache(): Promise<File | null> {
  const db = await openDatabase();
  if (!db) {
    return null;
  }

  return await new Promise<File | null>((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(ORIGINAL_IMAGE_KEY);

    request.onsuccess = () => {
      const result = request.result;
      db.close();

      if (result instanceof File) {
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

export async function clearOriginalImageCache() {
  const db = await openDatabase();
  if (!db) {
    return;
  }

  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    store.delete(ORIGINAL_IMAGE_KEY);

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
