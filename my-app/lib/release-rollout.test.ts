import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ACCEPTANCE_PAUSE_RETRY_AFTER_SECONDS,
  GENERATION_ACCEPTANCE_PAUSED_CODE,
  isGenerationAcceptanceEnabled,
  isStylingAcceptanceEnabled,
  STYLING_ACCEPTANCE_PAUSED_CODE,
} from "./release-rollout.ts";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("new acceptance remains enabled unless an operator explicitly pauses it", () => {
  assert.equal(isGenerationAcceptanceEnabled({}), true);
  assert.equal(isGenerationAcceptanceEnabled({ GENERATION_ACCEPTANCE_ENABLED: "true" }), true);
  assert.equal(isGenerationAcceptanceEnabled({ GENERATION_ACCEPTANCE_ENABLED: " FALSE " }), false);
  assert.equal(isStylingAcceptanceEnabled({}), true);
  assert.equal(isStylingAcceptanceEnabled({ STYLING_ACCEPTANCE_ENABLED: "false" }), false);
  assert.equal(ACCEPTANCE_PAUSE_RETRY_AFTER_SECONDS, 300);
  assert.equal(GENERATION_ACCEPTANCE_PAUSED_CODE, "GENERATION_ACCEPTANCE_PAUSED");
  assert.equal(STYLING_ACCEPTANCE_PAUSED_CODE, "STYLING_ACCEPTANCE_PAUSED");
});

test("generation pause blocks only new drafts and preserves accepted replay", () => {
  const route = read("../app/api/generations/accept/route.ts");
  assert.match(route, /!isAcceptanceReplay && !isGenerationAcceptanceEnabled\(\)/);
  assert.match(route, /GENERATION_ACCEPTANCE_PAUSED_CODE/);
  assert.match(route, /"Retry-After": String\(ACCEPTANCE_PAUSE_RETRY_AFTER_SECONDS\)/);
});

test("Styler pause preserves completed and generating session recovery", () => {
  const route = read("../app/api/styling/generate/route.ts");
  const completedIndex = route.indexOf('session.status === "completed"');
  const pauseIndex = route.indexOf("!isStylingAcceptanceEnabled()");
  assert.ok(completedIndex >= 0 && pauseIndex > completedIndex);
  assert.match(route, /session\.status !== "generating" && !isStylingAcceptanceEnabled\(\)/);
  assert.match(route, /STYLING_ACCEPTANCE_PAUSED_CODE/);
  assert.match(route, /"Retry-After": String\(ACCEPTANCE_PAUSE_RETRY_AFTER_SECONDS\)/);
});

test("release examples default to accepting work while push remains off", () => {
  const envExample = read("../.env.local.example");
  assert.match(envExample, /^GENERATION_ACCEPTANCE_ENABLED=true$/m);
  assert.match(envExample, /^STYLING_ACCEPTANCE_ENABLED=true$/m);
  assert.match(envExample, /^GENERATION_PUSH_ENABLED=false$/m);
});

test("release governance records owners, compatibility windows, alerts, and customer fallback", () => {
  const governance = read("../../docs/frontend-uiux-improvement-plan/release-governance-2026-07-18.md");
  const releaseNotes = read("../../docs/frontend-uiux-improvement-plan/release-candidate-notes-2026-07-18.md");
  assert.match(governance, /GENERATION_ACCEPTANCE_ENABLED=true/);
  assert.match(governance, /STYLING_ACCEPTANCE_ENABLED=true/);
  assert.match(governance, /Rollout owner/);
  assert.match(governance, /호환 릴리스 2회와 연속 30일 mismatch 0/);
  assert.match(governance, /이메일 oldest actionable queue age[\s\S]*15분 이상/);
  assert.match(governance, /delivery_unknown[\s\S]*1건 이상 즉시/);
  assert.match(releaseNotes, /마이페이지 `작업 현황`/);
  assert.match(releaseNotes, /모바일 Push[\s\S]*꺼져 있습니다/);
  assert.match(releaseNotes, /인앱 작업 현황과 완료 이메일/);
});
