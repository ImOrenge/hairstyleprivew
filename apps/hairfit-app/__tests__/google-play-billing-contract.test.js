/* global __dirname, describe, expect, test */

const fs = require("node:fs");
const path = require("node:path");

const appRoot = path.resolve(__dirname, "..");

function source(relativePath) {
  return fs.readFileSync(path.resolve(appRoot, relativePath), "utf8");
}

describe("Android Google Play billing contract", () => {
  test("routes Android billing through expo-iap while retaining PortOne for other platforms", () => {
    const route = source("app/billing.tsx");
    expect(route).toContain('Platform.OS === "android"');
    expect(route).toContain("<GooglePlayBillingScreen />");
    expect(route).toContain("<PortoneBillingScreen />");
  });

  test("binds intent identity, monthly offer, verification, restore, and finish", () => {
    const screen = source("components/billing/GooglePlayBillingScreen.tsx");
    for (const contract of [
      "createGooglePlayPurchaseIntent",
      "obfuscatedAccountId",
      "obfuscatedProfileId",
      "basePlanIdAndroid",
      "offerTokenAndroid",
      "verifyGooglePlayPurchase",
      "getAvailablePurchases",
      "finishTransaction",
      'purchase.purchaseState === "pending"',
      'error.code === "user-cancelled"',
    ]) {
      expect(screen).toContain(contract);
    }
  });

  test("uses Play localized prices and does not expose a PortOne refund flow", () => {
    const screen = source("components/billing/GooglePlayBillingScreen.tsx");
    expect(screen).toContain("storePriceByProductId");
    expect(screen).toContain("product.displayPrice");
    expect(screen).not.toContain("MobileRefundInterviewFlow");
    expect(screen).not.toContain("@portone/react-native-sdk");
  });
});
