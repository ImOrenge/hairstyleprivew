import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { MAKEUP_INTERVIEW_REQUIRED_TOPICS, MAKEUP_INTERVIEW_TOPICS, MAKEUP_MODES } from "../../packages/shared/src/makeup/interview.ts";

const app = (...parts: string[]) => readFileSync(resolve(process.cwd(), ...parts), "utf8");
const root = (...parts: string[]) => readFileSync(resolve(process.cwd(), "..", ...parts), "utf8");

test("P40 makeup interview keeps six modes, five required topics, and two optional topics", () => {
  assert.equal(MAKEUP_MODES.length, 6);
  assert.equal(MAKEUP_INTERVIEW_REQUIRED_TOPICS.length, 5);
  assert.equal(MAKEUP_INTERVIEW_TOPICS.length - MAKEUP_INTERVIEW_REQUIRED_TOPICS.length, 2);
  const ui = app("components", "consulting", "makeup", "MakeupDirectionInterview.tsx");
  assert.match(ui, /건너뛰기/); assert.match(ui, /상담을 나갈까요/); assert.match(ui, /AI 추천 검토하기/);
});

test("P40 recommendation never silently changes the user mode and AI narrative is nonblocking", () => {
  const policy = root("packages", "shared", "src", "makeup", "rationale.ts");
  const review = app("components", "consulting", "makeup", "MakeupRecommendationReview.tsx");
  assert.match(policy, /acceptedMode: null/); assert.match(policy, /decision: "pending"/);
  assert.match(review, /AI 조정안 적용/); assert.match(review, /내 선택 유지/); assert.match(review, /기다리지 않고 선택할 수 있어요/);
});

test("P40 APIs preserve revisions, owner checks, durable idempotency, and evidence allow-list", () => {
  const server = app("lib", "makeup", "makeup-interview-server.ts");
  const ai = app("lib", "capabilities", "makeup-rationale-service.ts");
  assert.match(server, /MAKEUP_INTERVIEW_REVISION_CONFLICT/); assert.match(server, /consultation_sessions/); assert.match(server, /confirmedRevision/);
  assert.match(ai, /makeupRationaleIdempotencyKey/); assert.match(ai, /allowed\.has/); assert.doesNotMatch(ai, /sourceImage|photoUrl|imageData/);
});

test("P40 migration mirrors constraints without weakening RLS and report projects rationale revision", () => {
  const migration = root("supabase", "migrations", "20260816112511_extend_makeup_interview_rationale.sql");
  const mirror = app("supabase", "migrations", "20260816112511_extend_makeup_interview_rationale.sql");
  assert.equal(migration, mirror);
  assert.match(migration, /'makeup-direction'/); assert.match(migration, /'makeup-rationale-generation'/);
  assert.doesNotMatch(migration, /disable row level security|grant .*authenticated/i);
  const report = root("packages", "shared", "src", "consulting", "report-v2.ts");
  assert.match(report, /rationaleRevision/); assert.match(report, /adjustmentDecision/); assert.match(report, /makeupRationale\?\.evidence/);
});
