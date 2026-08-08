import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getOriginalImageCacheKey,
  readOwnedOriginalImageRecord,
} from "./uploadImageCache.ts";

test("uses a distinct IndexedDB namespace for each authenticated account", () => {
  assert.notEqual(
    getOriginalImageCacheKey("user_account_a"),
    getOriginalImageCacheKey("user_account_b"),
  );
});

test("account B cannot hydrate account A's metadata-bound face image", () => {
  const accountAImage = new Blob(["private-face-a"], { type: "image/webp" });
  const storedForAccountA = {
    version: 2,
    ownerId: "user_account_a",
    image: accountAImage,
    savedAt: "2026-07-15T12:00:00.000Z",
  };

  assert.equal(readOwnedOriginalImageRecord(storedForAccountA, "user_account_a"), accountAImage);
  assert.equal(readOwnedOriginalImageRecord(storedForAccountA, "user_account_b"), null);
});

test("rejects unowned v1 blobs instead of guessing their owner", () => {
  assert.equal(
    readOwnedOriginalImageRecord(new Blob(["legacy-unowned-face"]), "user_account_a"),
    null,
  );
});

test("IndexedDB cache recovery cannot block the global page boundary forever", () => {
  const source = readFileSync(new URL("./uploadImageCache.ts", import.meta.url), "utf8");

  assert.match(source, /CACHE_OPERATION_TIMEOUT_MS/);
  assert.match(source, /request\.onblocked = \(\) => finish\(null\)/);
  assert.match(source, /transaction\.onabort = \(\) => finish\(null\)/);
});
