import test from "node:test";
import assert from "node:assert/strict";
import {
  AFTERCARE_EMAIL_CHECKPOINTS,
  aftercareScheduledSendAt,
  buildAftercareEmailItems,
  normalizeAftercareEmailBaseUrl,
  renderAftercareEmail,
  validateAftercareEmailContent,
} from "./aftercare-email.ts";

const input = {
  actualServiceId: "5c215fb6-fccf-452a-bbe4-b20468cb89df",
  consultationId: "ea2cac7a-3439-46ee-8235-f2e08f62feeb",
  programVersion: 2,
  serviceDate: "2026-08-21",
  styleName: "레이어드 펌",
  services: ["펌"],
  today: ["낮은 온도로 말려 주세요.", "끝부분은 찬바람으로 정리해 주세요."],
  checkpoints: [{ offset: "D+3", action: "두피 자극을 확인해 주세요." }],
  concerns: ["통증이 있으면 사용을 멈춰 주세요."],
  baseUrl: "https://hairfit.beauty",
};

test("six durable checkpoints are generated exactly once", () => {
  const items = buildAftercareEmailItems(input);
  assert.equal(items.length, 6);
  assert.deepEqual(items.map((item) => item.checkpoint), AFTERCARE_EMAIL_CHECKPOINTS);
  assert.equal(new Set(items.map((item) => item.checkpoint)).size, 6);
});

test("every checkpoint is scheduled at 09:00 KST", () => {
  const items = buildAftercareEmailItems(input);
  assert.equal(items[0].scheduledSendAt, "2026-08-22T00:00:00.000Z");
  assert.equal(items[5].scheduledSendAt, "2026-11-19T00:00:00.000Z");
  for (const item of items) assert.match(item.scheduledSendAt, /T00:00:00\.000Z$/);
  assert.equal(aftercareScheduledSendAt("2026-12-31", "d1"), "2027-01-01T00:00:00.000Z");
});

test("fixed renderer includes subject contract, preheader, HTML, text and both links", () => {
  const [item] = buildAftercareEmailItems(input);
  assert.match(item.subject, /^HairFit \| D\+1 /);
  assert.match(item.html, /HAIRFIT AFTERCARE/);
  assert.match(item.html, /에프터케어 기록 확인/);
  assert.match(item.html, /알림 관리/);
  assert.match(item.text, /오늘의 관리 단계/);
  assert.match(item.text, /알림 관리:/);
  assert.ok(item.content.careSteps.length >= 5);
  assert.ok(item.content.cautions.length >= 3);
  assert.ok(item.html.length > 3000);
  assert.match(item.text, /펌 모발은/);
  assert.ok(validateAftercareEmailContent(item.content));
});

test("renderer escapes structured AI text and never accepts AI HTML", () => {
  const [item] = buildAftercareEmailItems({ ...input, today: ["<script>alert('x')</script>"] });
  assert.doesNotMatch(item.html, /<script>/);
  assert.match(item.html, /&lt;script&gt;/);
});

test("fallback content remains sendable when structured AI fields are malformed", () => {
  const [item] = buildAftercareEmailItems({ ...input, today: { html: "<h1>unsafe</h1>" }, concerns: null });
  assert.ok(item.content.careSteps.length >= 1);
  assert.ok(item.content.cautions.length >= 1);
  assert.doesNotMatch(item.html, /<h1>unsafe<\/h1>/);
  assert.doesNotMatch(item.html + item.text, /localhost|\{\{|__[_A-Z]+__/i);
});

test("public HTTPS links are mandatory", () => {
  assert.throws(() => normalizeAftercareEmailBaseUrl("http://localhost:3000"), /public HTTPS/);
  assert.throws(() => normalizeAftercareEmailBaseUrl("https://127.0.0.1"), /public HTTPS/);
  const [item] = buildAftercareEmailItems(input);
  assert.throws(() => renderAftercareEmail({ ...item.content, cta: { ...item.content.cta, url: "http://localhost:3000" } }), /invalid/);
});
