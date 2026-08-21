import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import type { ConsultationFashionContextV1, FashionOfferSnapshotV1, UserFashionPersonalizationPolicyV1 } from "@hairfit/shared";
import {
  compileFashionPersonalizationSnapshotV1,
  normalizeConsultationFashionContextV1,
  normalizeUserFashionPolicyV1,
  rankFashionOfferSnapshotsV2,
} from "./fashion-personalization-policy.ts";

const root = process.cwd();
const policy: UserFashionPersonalizationPolicyV1 = {
  schemaVersion: "user-fashion-personalization-policy-v1", userId: "user", styleTarget: "male",
  sizeProfile: [{ category: "outer", system: "KR", value: "100", source: "user-entered" }],
  fitPreferences: ["regular"], silhouettePreferences: [], baselineBudget: { minKrw: 50000, maxKrw: 200000 },
  avoidRules: ["constraints-confirmed"], materialPreferences: [], materialSensitivities: ["wool"],
  accessibilityNeeds: [], preferredBrands: [], avoidedBrands: ["Avoid Brand"], preferredSellers: [],
  avoidedSellers: [], ethicalPreferences: [], learningConsent: false, revision: 2, confirmedRevision: 2,
  updatedAt: "2026-08-20T00:00:00.000Z",
};
const context: ConsultationFashionContextV1 = {
  schemaVersion: "consultation-fashion-context-v1", consultationId: "consultation", occasion: "work",
  dressCode: "business-casual", environment: ["indoor"], season: "autumn", oneTimeGoal: "calm",
  oneTimeBudgetOverride: null, mustUseOwnedItemIds: [], revision: 1, confirmedRevision: 1,
};
function offer(overrides: Partial<FashionOfferSnapshotV1> = {}): FashionOfferSnapshotV1 {
  return {
    schemaVersion: "fashion-product-offer-v1", offerId: "offer", sourceId: "source", sellerId: "seller",
    sellerProductId: "sku", canonicalProductId: "product", brandName: "Brand", productName: "Jacket",
    category: "outer", colorFamily: ["navy"], materialTags: ["cotton"], sizeSystem: "KR",
    availableSizes: ["100"], price: { amount: 120000, currency: "KRW" }, listPrice: null,
    availability: "in-stock", shipsToKorea: true, productUrl: "https://shop.example.com/p/sku",
    imageUrl: null, observedAt: "2026-08-20T00:00:00.000Z", expiresAt: "2026-08-20T02:00:00.000Z",
    sourceFingerprint: "sha256:offer", snapshotId: "snapshot", capturedForConsultationId: "consultation",
    recommendationRevision: 1, immutable: true, ...overrides,
  };
}

test("style target remains onboarding-owned and every size remains user-entered", () => {
  const next = normalizeUserFashionPolicyV1({
    userId: "user", current: policy, styleTarget: "female", nextRevision: 3,
    patch: { styleTarget: "neutral", sizeProfile: [{ category: "top", system: "KR", value: "95", source: "vision" }] },
  });
  assert.equal(next.styleTarget, "female");
  assert.equal(next.sizeProfile[0]?.source, "user-entered");
  assert.equal(next.confirmedRevision, 0);
});

test("consultation override is separate and does not acquire persistent fit or avoid fields", () => {
  const next = normalizeConsultationFashionContextV1({
    consultationId: "consultation", current: context, nextRevision: 2,
    patch: { occasion: "date", oneTimeBudgetOverride: { minKrw: 80000, maxKrw: 250000 }, fitPreferences: ["oversized"], avoidRules: [] },
  });
  assert.equal(next.occasion, "date");
  assert.equal("fitPreferences" in next, false);
  assert.equal(policy.baselineBudget.maxKrw, 200000);
});

test("the same revisions produce one fingerprint and bind one confirmed Hair to product snapshots", () => {
  const input = {
    consultationId: "consultation", policy, context, confirmedHairRevision: 4,
    confirmedColorRevision: 2, confirmedMakeupRevision: 3, productCatalogRevision: "catalog",
    productOfferSnapshotIds: ["offer-snapshot"], sourceIds: ["policy:2","context:1","hair:4"],
    supersedesSnapshotId: null,
  };
  const first = compileFashionPersonalizationSnapshotV1(input);
  const second = compileFashionPersonalizationSnapshotV1(input);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.confirmedHairRevision, 4);
  assert.deepEqual(first.productOfferSnapshotIds, ["offer-snapshot"]);
});

test("hard avoid, sensitivity, size and budget filters outrank maximum trend", () => {
  const ranked = rankFashionOfferSnapshotsV2({
    policy, context, trendScores: { outer: 1 },
    offers: [
      offer({ snapshotId: "eligible" }),
      offer({ snapshotId: "blocked", brandName: "Avoid Brand", materialTags: ["wool"], availableSizes: ["105"], price: { amount: 300000, currency: "KRW" } }),
    ],
  });
  assert.equal(ranked[0]?.offerSnapshotId, "eligible");
  assert.equal(ranked[1]?.eligible, false);
  assert.deepEqual(new Set(ranked[1]?.hardFilterReasonCodes), new Set(["size-unavailable","brand-avoided","material-sensitivity","budget-over-maximum"]));
});

test("P51 APIs, UI and migration preserve revisions ownership returnTo and immutable history", () => {
  const api = fs.readFileSync(path.join(root, "app/api/v2/me/onboarding/fashion-personalization/route.ts"), "utf8");
  const server = fs.readFileSync(path.join(root, "lib/consulting/fashion-personalization-server.ts"), "utf8");
  const web = fs.readFileSync(path.join(root, "components/onboarding/FashionPersonalizationForm.tsx"), "utf8");
  const native = fs.readFileSync(path.join(root, "../apps/hairfit-app/app/fashion-personalization.tsx"), "utf8");
  const migration = fs.readFileSync(path.join(root, "../supabase/migrations/20260820173000_fashion_personalization.sql"), "utf8");
  assert.match(api, /await auth\(\)/);
  assert.match(api, /expectedRevision/);
  assert.match(server, /eq\("user_id", userId\)/);
  assert.match(server, /CONFIRMED_HAIR_REQUIRED/);
  assert.doesNotMatch(server, /bodyPhoto|image.*size|infer.*gender/i);
  assert.match(web, /상담으로 돌아가기/);
  assert.match(native, /사진으로 사이즈·성별·체중·접근성 조건을 추론하지 않습니다/);
  assert.match(migration, /FASHION_PERSONALIZATION_SNAPSHOT_IMMUTABLE/);
  assert.match(migration, /auth\.jwt\(\) ->> 'sub'/);
});
