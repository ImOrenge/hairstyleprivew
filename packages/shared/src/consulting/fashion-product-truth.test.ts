import assert from "node:assert/strict";
import test from "node:test";
import { evaluateFashionOfferEligibility, type FashionProductOfferV1, type FashionProductSourceV1 } from "./fashion-product-truth.ts";

const source: FashionProductSourceV1 = {
  sourceId: "official",
  sourceType: "official-api",
  sellerId: "seller",
  territory: ["KR"],
  refreshSlaMinutes: 60,
  imageUsagePolicy: "link",
  affiliateDisclosureRequired: true,
  enabled: true,
  lastHealthyAt: "2026-08-20T00:00:00.000Z",
};

const offer: FashionProductOfferV1 = {
  schemaVersion: "fashion-product-offer-v1",
  offerId: "offer",
  sourceId: "official",
  sellerId: "seller",
  sellerProductId: "sku",
  canonicalProductId: "product",
  brandName: "Brand",
  productName: "Jacket",
  category: "outer",
  colorFamily: ["navy"],
  materialTags: ["cotton"],
  sizeSystem: "KR",
  availableSizes: ["100"],
  price: { amount: 120_000, currency: "KRW" },
  listPrice: null,
  availability: "in-stock",
  shipsToKorea: true,
  productUrl: "https://shop.example.com/products/sku",
  imageUrl: null,
  observedAt: "2026-08-20T00:00:00.000Z",
  expiresAt: "2026-08-20T02:00:00.000Z",
  sourceFingerprint: "sha256:offer",
};

test("verified fresh offers are eligible", () => {
  assert.deepEqual(evaluateFashionOfferEligibility(offer, source, {
    now: "2026-08-20T01:00:00.000Z",
    compatibleSizes: ["100"],
    allowedHosts: ["shop.example.com"],
    trustedSellerIds: ["seller"],
  }), { eligible: true, reasonCodes: [] });
});

test("stale, out-of-stock, wrong-size, or untrusted links are rejected", () => {
  const result = evaluateFashionOfferEligibility({
    ...offer,
    availability: "out-of-stock",
    productUrl: "http://malicious.example/product",
  }, source, {
    now: "2026-08-20T03:00:00.000Z",
    compatibleSizes: ["105"],
    allowedHosts: ["shop.example.com"],
    trustedSellerIds: ["seller"],
  });
  assert.equal(result.eligible, false);
  assert.deepEqual(new Set(result.reasonCodes), new Set([
    "availability-unusable",
    "size-unavailable",
    "offer-stale",
    "product-url-untrusted",
  ]));
});

test("source SLA expires an offer before its provider expiry", () => {
  const result = evaluateFashionOfferEligibility({
    ...offer,
    expiresAt: "2026-08-21T00:00:00.000Z",
  }, source, {
    now: "2026-08-20T01:01:00.000Z",
    compatibleSizes: ["100"],
    allowedHosts: ["shop.example.com"],
    trustedSellerIds: ["seller"],
  });
  assert.equal(result.eligible, false);
  assert.deepEqual(result.reasonCodes, ["offer-stale"]);
});

test("an image is rejected when the registered source grants no display right", () => {
  const result = evaluateFashionOfferEligibility({
    ...offer,
    imageUrl: "https://shop.example.com/images/sku.jpg",
  }, { ...source, imageUsagePolicy: "none" }, {
    now: "2026-08-20T00:30:00.000Z",
    compatibleSizes: ["100"],
    allowedHosts: ["shop.example.com"],
    trustedSellerIds: ["seller"],
  });
  assert.deepEqual(result.reasonCodes, ["image-display-not-licensed"]);
});
