import assert from "node:assert/strict";
import test from "node:test";

import {
  GOOGLE_PLAY_PRODUCTS,
  getGooglePlayProductById,
} from "./google-play.ts";

test("Google Play catalog keeps the approved 15 percent Android prices", () => {
  assert.deepEqual(
    Object.values(GOOGLE_PLAY_PRODUCTS).map(({ key, priceKrw }) => [key, priceKrw]),
    [
      ["basic", 11_400],
      ["standard", 22_900],
      ["pro", 57_400],
      ["usage30", 6_800],
      ["usage80", 16_000],
      ["usage200", 34_400],
    ],
  );
});

test("Google Play catalog separates subscriptions from consumable usage packs", () => {
  assert.equal(GOOGLE_PLAY_PRODUCTS.basic.productType, "subscription");
  assert.equal(GOOGLE_PLAY_PRODUCTS.pro.basePlanId, "monthly-auto");
  assert.equal(GOOGLE_PLAY_PRODUCTS.usage30.productType, "consumable");
  assert.equal(GOOGLE_PLAY_PRODUCTS.usage200.basePlanId, null);
});

test("Google Play product IDs resolve only from the allowlisted catalog", () => {
  assert.equal(getGooglePlayProductById("hairfit_standard")?.key, "standard");
  assert.equal(getGooglePlayProductById("hairfit_usage_80")?.key, "usage80");
  assert.equal(getGooglePlayProductById("unknown"), null);
});
