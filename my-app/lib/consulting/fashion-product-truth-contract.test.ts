import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  classifyFashionOfferRevalidation,
  evaluateRegisteredFashionOfferV1,
  normalizeFashionProductOfferV1,
  type RegisteredFashionProductSourceV1,
} from "./fashion-product-freshness.ts";

const root = process.cwd();
const source: RegisteredFashionProductSourceV1 = {
  sourceId: "manual-kr", sourceType: "verified-manual", sellerId: "seller-kr", territory: ["KR"],
  allowedHosts: ["shop.example.com"], refreshSlaMinutes: 60, imageUsagePolicy: "link",
  affiliateDisclosureRequired: true, enabled: true, lastHealthyAt: null, quarantinedAt: null, quarantineReason: null,
};

function rawOffer() {
  return {
    offerId: "offer-1", sellerProductId: "sku-1", canonicalProductId: "canonical-1",
    brandName: "브랜드", productName: "재킷", category: "outer", colorFamily: ["navy"], materialTags: ["cotton"],
    sizeSystem: "KR", availableSizes: ["100", "105"], price: { amount: 129000, currency: "KRW" },
    listPrice: { amount: 159000, currency: "KRW" }, availability: "in-stock", shipsToKorea: true,
    productUrl: "https://shop.example.com/products/sku-1", imageUrl: "https://shop.example.com/images/sku-1.jpg",
    observedAt: "2026-08-20T00:00:00.000Z", expiresAt: "2026-08-20T02:00:00.000Z",
  };
}

test("verified manual ingestion normalizes identity and replaces provider fingerprints", () => {
  const offer = normalizeFashionProductOfferV1(rawOffer(), source);
  assert.equal(offer.sourceId, source.sourceId);
  assert.equal(offer.sellerId, source.sellerId);
  assert.match(offer.sourceFingerprint, /^sha256:[a-f0-9]{64}$/);
});

test("URL, image-right, source health, stock, freshness and size policies fail closed", () => {
  assert.throws(() => normalizeFashionProductOfferV1({ ...rawOffer(), productUrl: "http://shop.example.com/products/sku-1" }, source), /PRODUCT_URL_UNTRUSTED/);
  assert.throws(() => normalizeFashionProductOfferV1(rawOffer(), { ...source, imageUsagePolicy: "none" }), /IMAGE_NOT_ALLOWED/);
  const offer = normalizeFashionProductOfferV1(rawOffer(), source);
  assert.deepEqual(evaluateRegisteredFashionOfferV1(offer, { ...source, quarantinedAt: "2026-08-20T00:01:00.000Z" }, {
    now: "2026-08-20T00:30:00.000Z", compatibleSizes: ["100"],
  }), { eligible: false, reasonCodes: ["source-quarantined"] });
  assert.equal(evaluateRegisteredFashionOfferV1({ ...offer, availability: "out-of-stock" }, source, {
    now: "2026-08-20T00:30:00.000Z", compatibleSizes: ["90"],
  }).eligible, false);
});

test("revalidation preserves the recommendation snapshot and reports current price drift", () => {
  const snapshot = normalizeFashionProductOfferV1(rawOffer(), source);
  const changed = { ...snapshot, price: { amount: 139000, currency: "KRW" as const } };
  assert.equal(classifyFashionOfferRevalidation(snapshot, changed, true), "price-changed");
  assert.equal(snapshot.price.amount, 129000);
  assert.equal(classifyFashionOfferRevalidation(snapshot, null, false), "replacement-required");
});

test("P50 database enforces service-only access and immutable snapshot updates", () => {
  const sql = fs.readFileSync(path.join(root, "../supabase/migrations/20260820170000_fashion_product_truth.sql"), "utf8");
  for (const table of ["fashion_product_sources_v2", "fashion_products_v2", "fashion_product_offers_v2", "fashion_product_offer_snapshots_v2", "fashion_product_source_runs_v2"]) {
    assert.match(sql, new RegExp(table));
  }
  assert.match(sql, /force row level security/i);
  assert.match(sql, /revoke all on table public\.%I from public, anon, authenticated/i);
  assert.match(sql, /FASHION_OFFER_SNAPSHOT_IMMUTABLE/);
  assert.match(sql, /before update on public\.fashion_product_offer_snapshots_v2/);
  assert.match(sql, /Trend research is forbidden from writing this table/);
});

test("customer and admin APIs retain separate owner and role checks", () => {
  const customer = fs.readFileSync(path.join(root, "app/api/v2/consultations/[consultationId]/fashion/offers/route.ts"), "utf8");
  const server = fs.readFileSync(path.join(root, "lib/consulting/fashion-product-offer-server.ts"), "utf8");
  const admin = fs.readFileSync(path.join(root, "app/api/admin/fashion/product-sources/[sourceId]/rebuild/route.ts"), "utf8");
  assert.match(customer, /await auth\(\)/);
  assert.match(server, /eq\("user_id", userId\)/);
  assert.match(admin, /getAdminApiContext\(\)/);
  assert.match(admin, /idempotency-key/);
  assert.doesNotMatch(server, /fashion-trend-research/);
});
