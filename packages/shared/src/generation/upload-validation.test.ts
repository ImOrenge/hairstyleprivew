import assert from "node:assert/strict";
import test from "node:test";
import {
  GENERATION_UPLOAD_MAX_BYTES,
  getBase64DecodedByteSize,
  validateGenerationUploadMetadata,
} from "./upload-validation.ts";

function assertFailure(
  result: ReturnType<typeof validateGenerationUploadMetadata>,
  code: "invalid_file" | "unsupported_type" | "too_large" | "too_small",
) {
  assert.equal(result.ok, false);
  if (result.ok) assert.fail(`Expected ${code} validation failure`);
  assert.equal(result.code, code);
}

test("generation upload accepts the exact 8MB boundary and supported formats", () => {
  for (const mimeType of ["image/jpeg", "image/png", "image/webp"]) {
    assert.deepEqual(
      validateGenerationUploadMetadata({
        mimeType,
        byteSize: GENERATION_UPLOAD_MAX_BYTES,
        width: 512,
        height: 512,
      }),
      { ok: true, mimeType, byteSize: GENERATION_UPLOAD_MAX_BYTES },
    );
  }
});

test("generation upload rejects unsupported, oversized, unreadable, and small images", () => {
  assertFailure(
    validateGenerationUploadMetadata({ mimeType: "image/heic", byteSize: 100 }),
    "unsupported_type",
  );
  assertFailure(
    validateGenerationUploadMetadata({
      mimeType: "image/jpeg",
      byteSize: GENERATION_UPLOAD_MAX_BYTES + 1,
    }),
    "too_large",
  );
  assertFailure(
    validateGenerationUploadMetadata({ mimeType: "image/jpeg", byteSize: 0 }),
    "invalid_file",
  );
  assertFailure(
    validateGenerationUploadMetadata({
      mimeType: "image/jpeg",
      byteSize: 100,
      width: 511,
      height: 512,
    }),
    "too_small",
  );
});

test("base64 decoded byte estimation accounts for padding", () => {
  assert.equal(getBase64DecodedByteSize("YQ=="), 1);
  assert.equal(getBase64DecodedByteSize("YWI="), 2);
  assert.equal(getBase64DecodedByteSize("YWJj"), 3);
  assert.equal(getBase64DecodedByteSize("invalid"), 0);
});
