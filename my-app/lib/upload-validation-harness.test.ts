import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const page = read("../app/e2e-harness/upload/page.tsx");
const harness = read("../components/e2e/UploadValidationHarness.tsx");
const uploadArea = read("../components/upload/UploadArea.tsx");
const validationCheck = read("../components/upload/ValidationCheck.tsx");
const validationContract = read("./upload-validation-contract.ts");
const globals = read("../app/globals.css");
const draftRoute = read("../app/api/generations/drafts/route.ts");
const generationHook = read("../hooks/useGenerate.ts");

test("upload E2E harness is fail-closed outside an explicit test build", () => {
  assert.match(page, /process\.env\.E2E_UI_HARNESS_ENABLED !== "true"/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
});

test("upload E2E harness composes production validation components", () => {
  assert.match(harness, /<UploadArea/);
  assert.match(harness, /<ValidationCheck/);
  assert.match(harness, /useUpload\(\)/);
  assert.doesNotMatch(harness, /8 \* 1024 \* 1024/);
});

test("UploadArea forwards rejected MIME files into the validation surface", () => {
  assert.match(uploadArea, /"image\/jpeg"/);
  assert.match(uploadArea, /"image\/png"/);
  assert.match(uploadArea, /"image\/webp"/);
  assert.match(uploadArea, /onDropRejected/);
  assert.match(uploadArea, /onRejectFile\?\.\(file\)/);
  assert.match(uploadArea, /"aria-label": "사진 파일 선택"/);
  assert.match(uploadArea, /aria-label="카메라로 사진 촬영"/);
  assert.match(uploadArea, /className="c-upload-area"/);
  assert.match(uploadArea, /data-drag-state=/);
  assert.match(globals, /\.c-upload-area\s*\{/);
  assert.match(globals, /\.c-upload-area\[data-drag-state="reject"\]/);
  assert.match(globals, /\.c-upload-area\[data-disabled="true"\]/);
});

test("upload errors interrupt assistive technology while non-errors remain polite", () => {
  assert.match(validationContract, /export type UploadStatus/);
  assert.doesNotMatch(validationCheck, /hooks\/useUpload/);
  assert.match(validationCheck, /role=\{status === "error" \? "alert" : "status"\}/);
  assert.match(validationCheck, /aria-live=\{status === "error" \? "assertive" : "polite"\}/);
  assert.match(validationCheck, /aria-atomic="true"/);
  assert.match(validationCheck, /aria-busy=\{status === "checking" \|\| undefined\}/);
  assert.match(validationCheck, /className="c-upload-validation"/);
  assert.match(globals, /\.c-upload-validation\s*\{/);
  assert.match(globals, /\.c-upload-validation\[data-status="error"\]/);
});

test("server upload failures expose stable status and code without leaking raw details", () => {
  assert.match(draftRoute, /UNSUPPORTED_IMAGE_TYPE/);
  assert.match(draftRoute, /IMAGE_TOO_LARGE/);
  assert.match(draftRoute, /"UNSUPPORTED_IMAGE_TYPE",\s*415/);
  assert.match(draftRoute, /"IMAGE_TOO_LARGE", 413/);
  assert.match(generationHook, /message: "사진을 안전하게 업로드하지 못했습니다\."/);
  assert.doesNotMatch(
    generationHook,
    /message: data\.error \|\| "사진을 안전하게 업로드하지 못했습니다\."/,
  );
});
