import assert from "node:assert/strict";
import test from "node:test";
import {
  needsKoreanDisplayTranslation,
  resolveKoreanDisplayCopy,
} from "./korean-display-copy.ts";

test("detects Latin model copy even when it is mixed with Korean", () => {
  assert.equal(needsKoreanDisplayTranslation("Soft layered cut"), true);
  assert.equal(needsKoreanDisplayTranslation("소프트 레이어드 컷"), false);
  assert.equal(needsKoreanDisplayTranslation("Soft cut 추천 스타일"), true);
});

test("uses Korean translation and fails closed to Korean fallback", () => {
  assert.equal(
    resolveKoreanDisplayCopy("Soft layered cut", "소프트 레이어드 컷", "추천 스타일"),
    "소프트 레이어드 컷",
  );
  assert.equal(
    resolveKoreanDisplayCopy("Soft layered cut", "Soft layered cut", "추천 스타일"),
    "추천 스타일",
  );
  assert.equal(resolveKoreanDisplayCopy("", "", "추천 스타일"), "추천 스타일");
});
