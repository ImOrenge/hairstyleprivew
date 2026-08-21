import { createHash } from "node:crypto";
import {
  evaluateFashionOfferEligibility,
  isTrustedFashionProductUrl,
  type FashionOfferEligibilityInputV1,
  type FashionProductDisclosureV1,
  type FashionProductOfferV1,
  type FashionProductSourceV1,
} from "@hairfit/shared";

export interface RegisteredFashionProductSourceV1 extends FashionProductSourceV1 {
  allowedHosts: string[];
  quarantinedAt: string | null;
  quarantineReason: string | null;
}

function nonEmptyString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`FASHION_OFFER_${field.toUpperCase()}_INVALID`);
  return value.trim();
}

function stringArray(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`FASHION_OFFER_${field.toUpperCase()}_INVALID`);
  }
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

export function normalizeFashionProductOfferV1(
  value: unknown,
  source: RegisteredFashionProductSourceV1,
  observedAtFallback = new Date().toISOString(),
): FashionProductOfferV1 {
  if (!value || typeof value !== "object") throw new Error("FASHION_OFFER_INVALID");
  const raw = value as Record<string, unknown>;
  const price = raw.price && typeof raw.price === "object" ? raw.price as Record<string, unknown> : {};
  const listPrice = raw.listPrice && typeof raw.listPrice === "object" ? raw.listPrice as Record<string, unknown> : null;
  const availability = raw.availability;
  if (!["in-stock", "low-stock", "out-of-stock", "unknown"].includes(String(availability))) {
    throw new Error("FASHION_OFFER_AVAILABILITY_INVALID");
  }
  const productUrl = nonEmptyString(raw.productUrl, "product_url");
  if (!isTrustedFashionProductUrl(productUrl, source.allowedHosts)) throw new Error("FASHION_OFFER_PRODUCT_URL_UNTRUSTED");
  const imageUrl = raw.imageUrl == null ? null : nonEmptyString(raw.imageUrl, "image_url");
  if (imageUrl && (source.imageUsagePolicy === "none" || !isTrustedFashionProductUrl(imageUrl, source.allowedHosts))) {
    throw new Error("FASHION_OFFER_IMAGE_NOT_ALLOWED");
  }
  const observedAt = typeof raw.observedAt === "string" ? raw.observedAt : observedAtFallback;
  const expiresAt = nonEmptyString(raw.expiresAt, "expires_at");
  if (!Number.isFinite(Date.parse(observedAt)) || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.parse(observedAt)) {
    throw new Error("FASHION_OFFER_TIME_INVALID");
  }
  const amount = Number(price.amount);
  const listAmount = listPrice ? Number(listPrice.amount) : null;
  if (!Number.isSafeInteger(amount) || amount < 0 || price.currency !== "KRW") throw new Error("FASHION_OFFER_PRICE_INVALID");
  if (listPrice && (!Number.isSafeInteger(listAmount) || Number(listAmount) < amount || listPrice.currency !== "KRW")) {
    throw new Error("FASHION_OFFER_LIST_PRICE_INVALID");
  }
  const normalized = {
    schemaVersion: "fashion-product-offer-v1",
    offerId: nonEmptyString(raw.offerId, "offer_id"),
    sourceId: source.sourceId,
    sellerId: source.sellerId,
    sellerProductId: nonEmptyString(raw.sellerProductId, "seller_product_id"),
    canonicalProductId: nonEmptyString(raw.canonicalProductId, "canonical_product_id"),
    brandName: nonEmptyString(raw.brandName, "brand_name"),
    productName: nonEmptyString(raw.productName, "product_name"),
    category: nonEmptyString(raw.category, "category"),
    colorFamily: stringArray(raw.colorFamily, "color_family"),
    materialTags: stringArray(raw.materialTags, "material_tags"),
    sizeSystem: nonEmptyString(raw.sizeSystem, "size_system"),
    availableSizes: stringArray(raw.availableSizes, "available_sizes"),
    price: { amount, currency: "KRW" },
    listPrice: listPrice ? { amount: Number(listAmount), currency: "KRW" as const } : null,
    availability: String(availability) as FashionProductOfferV1["availability"],
    shipsToKorea: raw.shipsToKorea === true,
    productUrl,
    imageUrl,
    observedAt,
    expiresAt,
  } satisfies Omit<FashionProductOfferV1, "sourceFingerprint">;
  const sourceFingerprint = `sha256:${createHash("sha256").update(JSON.stringify(normalized)).digest("hex")}`;
  return { ...normalized, sourceFingerprint };
}

export function evaluateRegisteredFashionOfferV1(
  offer: FashionProductOfferV1,
  source: RegisteredFashionProductSourceV1,
  input: Omit<FashionOfferEligibilityInputV1, "allowedHosts" | "trustedSellerIds">,
) {
  if (source.quarantinedAt) return { eligible: false, reasonCodes: ["source-quarantined"] };
  return evaluateFashionOfferEligibility(offer, source, {
    ...input,
    allowedHosts: source.allowedHosts,
    trustedSellerIds: [source.sellerId],
  });
}

export function buildFashionProductDisclosureV1(
  offer: FashionProductOfferV1,
  source: RegisteredFashionProductSourceV1,
): FashionProductDisclosureV1 {
  return {
    observedAt: offer.observedAt,
    priceMayChange: true,
    availabilityMayChange: true,
    affiliateDisclosureRequired: source.affiliateDisclosureRequired,
    imageDisplayAllowed: source.imageUsagePolicy !== "none" && Boolean(offer.imageUrl),
  };
}

export function classifyFashionOfferRevalidation(
  snapshot: FashionProductOfferV1,
  current: FashionProductOfferV1 | null,
  eligible: boolean,
) {
  if (!current || !eligible) return "replacement-required" as const;
  return current.price.amount === snapshot.price.amount ? "current" as const : "price-changed" as const;
}
