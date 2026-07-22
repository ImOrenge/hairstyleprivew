import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const appRoot = process.cwd();
const repoRoot = path.resolve(appRoot, "..");

async function read(relativePath) {
  return readFile(path.resolve(repoRoot, relativePath), "utf8");
}

const expectedProducts = [
  ["hairfit_basic", "11_400", "80"],
  ["hairfit_standard", "22_900", "200"],
  ["hairfit_pro", "57_400", "600"],
  ["hairfit_usage_30", "6_800", "30"],
  ["hairfit_usage_80", "16_000", "80"],
  ["hairfit_usage_200", "34_400", "200"],
];

const catalog = await read("packages/shared/src/billing/google-play.ts");
for (const [productId, price, credits] of expectedProducts) {
  assert.match(catalog, new RegExp(`productId: "${productId}"`), `${productId} is missing`);
  assert.match(catalog, new RegExp(`credits: ${credits}`), `${productId} credits are missing`);
  assert.match(catalog, new RegExp(`priceKrw: ${price}`), `${productId} price is missing`);
}
assert.match(catalog, /GOOGLE_PLAY_SUBSCRIPTION_BASE_PLAN_ID = "monthly-auto"/u);
assert.match(catalog, /GOOGLE_PLAY_PACKAGE_NAME = "com\.hairfit\.app"/u);

const routes = [
  "my-app/app/api/mobile/google-play/catalog/route.ts",
  "my-app/app/api/mobile/google-play/intents/route.ts",
  "my-app/app/api/mobile/google-play/purchases/verify/route.ts",
  "my-app/app/api/payments/google-play/rtdn/route.ts",
];
await Promise.all(routes.map(async (route) => assert.ok((await read(route)).length > 0, `${route} is empty`)));

const androidScreen = await read("apps/hairfit-app/components/billing/GooglePlayBillingScreen.tsx");
for (const contract of [
  "useIAP",
  "createGooglePlayPurchaseIntent",
  "obfuscatedAccountId",
  "obfuscatedProfileId",
  "offerTokenAndroid",
  "verifyGooglePlayPurchase",
  "finishTransaction",
  "getAvailablePurchases",
]) {
  assert.ok(androidScreen.includes(contract), `Android billing contract missing: ${contract}`);
}

const appConfig = JSON.parse(await read("apps/hairfit-app/app.json"));
assert.equal(appConfig.expo.android.package, "com.hairfit.app");
assert.equal(appConfig.expo.android.versionCode, 1);
assert.ok(appConfig.expo.plugins.includes("expo-iap"));

const appMigration = await read("my-app/supabase/migrations/20260722120000_google_play_billing.sql");
const rootMigration = await read("supabase/migrations/20260722120000_google_play_billing.sql");
assert.equal(appMigration, rootMigration, "Google Play migration mirrors differ");
for (const contract of [
  "google_play_purchase_intents",
  "google_play_purchases",
  "google_play_rtdn_events",
  "purchase_token_encrypted",
  "billing_provider",
  "purchase_intent_id",
]) {
  assert.ok(appMigration.includes(contract), `Migration contract missing: ${contract}`);
}

const billing = await read("my-app/lib/google-play-billing.ts");
for (const contract of [
  "apply_payment_credits",
  "finalize_automated_refund",
  "consumeGooglePlayPurchase",
  "acknowledgeGooglePlayPurchase",
  "startsWith(\"mob-\")",
  "payment.alreadyProcessed",
]) {
  assert.ok(billing.includes(contract), `Server billing contract missing: ${contract}`);
}
assert.ok(!billing.includes("console.log"), "Google Play billing must not log purchase tokens");

const rtdn = await read("my-app/app/api/payments/google-play/rtdn/route.ts");
for (const contract of [
  "verifyGooglePubSubAuthorization",
  "hashGooglePlayPurchaseToken",
  'existingEvent?.status === "processed"',
  "processGooglePlayPurchase",
  "processGooglePlayVoidedPurchase",
]) {
  assert.ok(rtdn.includes(contract), `RTDN contract missing: ${contract}`);
}

console.log("Google Play Billing audit passed: catalog, routes, Expo IAP, ledgers, and migration mirrors are consistent.");
