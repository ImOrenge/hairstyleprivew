export const GOOGLE_PLAY_PACKAGE_NAME = "com.hairfit.app";
export const GOOGLE_PLAY_SUBSCRIPTION_BASE_PLAN_ID = "monthly-auto";

export const GOOGLE_PLAY_PRODUCT_KEYS = [
  "basic",
  "standard",
  "pro",
  "usage30",
  "usage80",
  "usage200",
] as const;

export type GooglePlayProductKey = (typeof GOOGLE_PLAY_PRODUCT_KEYS)[number];
export type GooglePlayProductType = "subscription" | "consumable";

export interface GooglePlayCatalogProduct {
  key: GooglePlayProductKey;
  productId: string;
  productType: GooglePlayProductType;
  label: string;
  credits: number;
  priceKrw: number;
  basePlanId: string | null;
}

export const GOOGLE_PLAY_PRODUCTS: Readonly<Record<GooglePlayProductKey, GooglePlayCatalogProduct>> = {
  basic: {
    key: "basic",
    productId: "hairfit_basic",
    productType: "subscription",
    label: "Basic",
    credits: 80,
    priceKrw: 11_400,
    basePlanId: GOOGLE_PLAY_SUBSCRIPTION_BASE_PLAN_ID,
  },
  standard: {
    key: "standard",
    productId: "hairfit_standard",
    productType: "subscription",
    label: "Standard",
    credits: 200,
    priceKrw: 22_900,
    basePlanId: GOOGLE_PLAY_SUBSCRIPTION_BASE_PLAN_ID,
  },
  pro: {
    key: "pro",
    productId: "hairfit_pro",
    productType: "subscription",
    label: "Pro",
    credits: 600,
    priceKrw: 57_400,
    basePlanId: GOOGLE_PLAY_SUBSCRIPTION_BASE_PLAN_ID,
  },
  usage30: {
    key: "usage30",
    productId: "hairfit_usage_30",
    productType: "consumable",
    label: "추가 이용권 30",
    credits: 30,
    priceKrw: 6_800,
    basePlanId: null,
  },
  usage80: {
    key: "usage80",
    productId: "hairfit_usage_80",
    productType: "consumable",
    label: "추가 이용권 80",
    credits: 80,
    priceKrw: 16_000,
    basePlanId: null,
  },
  usage200: {
    key: "usage200",
    productId: "hairfit_usage_200",
    productType: "consumable",
    label: "추가 이용권 200",
    credits: 200,
    priceKrw: 34_400,
    basePlanId: null,
  },
};

export function isGooglePlayProductKey(value: unknown): value is GooglePlayProductKey {
  return typeof value === "string" && GOOGLE_PLAY_PRODUCT_KEYS.includes(value as GooglePlayProductKey);
}

export function getGooglePlayProduct(key: GooglePlayProductKey): GooglePlayCatalogProduct {
  return GOOGLE_PLAY_PRODUCTS[key];
}

export function getGooglePlayProductById(productId: unknown): GooglePlayCatalogProduct | null {
  if (typeof productId !== "string") return null;
  return Object.values(GOOGLE_PLAY_PRODUCTS).find((product) => product.productId === productId) ?? null;
}

export interface MobileGooglePlayCatalogProduct extends GooglePlayCatalogProduct {
  eligible: boolean;
  eligibilityReason: "eligible" | "subscription_required" | "active_subscription" | "portone_recurring";
}

export interface MobileGooglePlayCatalogResponse {
  enabled: boolean;
  packageName: string;
  products: MobileGooglePlayCatalogProduct[];
  activeSubscriptionProvider: "google_play" | "portone" | null;
  canTransitionLegacyMobile: boolean;
}

export interface MobileGooglePlayPurchaseIntentRequest {
  productKey: GooglePlayProductKey;
}

export interface MobileGooglePlayPurchaseIntentResponse {
  intentId: string;
  product: GooglePlayCatalogProduct;
  obfuscatedAccountId: string;
  obfuscatedProfileId: string;
  expiresAt: string;
}

export interface MobileGooglePlayPurchaseVerificationRequest {
  productId: string;
  purchaseToken: string;
}

export interface MobileGooglePlayPurchaseVerificationResponse {
  ok: true;
  productKey: GooglePlayProductKey;
  productType: GooglePlayProductType;
  state: "paid" | "pending" | "already_processed";
  transactionId: string | null;
  subscriptionId: string | null;
  creditsGranted: number;
  shouldFinishTransaction: boolean;
}
