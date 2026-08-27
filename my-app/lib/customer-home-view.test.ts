import assert from "node:assert/strict";
import test from "node:test";
import { buildCustomerHomeView } from "./customer-home-view.ts";

const careOnly = {
  actualServiceId: "care-1",
  styleName: "레이어드 케어",
  serviceDate: "2026-08-27T00:00:00.000Z",
};

test("home omits every image surface when there is no confirmed result", () => {
  const view = buildCustomerHomeView({ inProgress: null, completed: null, care: careOnly });

  assert.equal(view.confirmedImageUrl, null);
  assert.equal(view.confirmedImageAlt, null);
  assert.ok(view.recommendation);
  assert.equal(view.defaultActionId, "consultation");
  assert.equal(view.actions.find((action) => action.id === "consultation")?.href, "/consulting/new");
});

test("an in-progress consultation has first priority", () => {
  const view = buildCustomerHomeView({
    inProgress: {
      stageTitle: "사진 분석",
      startedAt: "2026-08-26T00:00:00.000Z",
      href: "/consulting/session-1/photo",
    },
    completed: null,
    care: null,
  });

  assert.equal(view.defaultActionId, "consultation");
  assert.equal(view.actions[0]?.ctaLabel, "컨설팅 이어하기");
  assert.match(view.recommendation?.currentStep ?? "", /사진 분석/);
});

test("only the completed consultation image is accepted as the hero look", () => {
  const view = buildCustomerHomeView({
    inProgress: null,
    completed: {
      title: "소프트 레이어드",
      completedAt: "2026-08-25T00:00:00.000Z",
      href: "/consulting/session-2/result",
      imageUrl: "https://example.com/confirmed.webp",
    },
    care: careOnly,
  });

  assert.equal(view.confirmedImageUrl, "https://example.com/confirmed.webp");
  assert.equal(view.defaultActionId, "result");
  assert.equal(view.recommendation, null);
});

test("care-only state keeps care actionable without promoting it to the hero image", () => {
  const view = buildCustomerHomeView({ inProgress: null, completed: null, care: careOnly });
  const care = view.actions.find((action) => action.id === "care");

  assert.equal(view.confirmedImageUrl, null);
  assert.equal(care?.available, true);
  assert.equal(care?.href, "/aftercare/care-1");
  assert.equal(view.defaultActionId, "consultation");
});
