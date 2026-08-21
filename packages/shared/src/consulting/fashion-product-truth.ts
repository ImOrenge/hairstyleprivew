export type FashionProductSourceType = "official-api" | "partner-feed" | "seller-export" | "verified-manual";

export interface FashionProductSourceV1 {
  sourceId: string;
  sourceType: FashionProductSourceType;
  sellerId: string;
  territory: string[];
  refreshSlaMinutes: number;
  imageUsagePolicy: "link" | "licensed-cache" | "none";
  affiliateDisclosureRequired: boolean;
  enabled: boolean;
  lastHealthyAt: string | null;
}

export interface FashionProductOfferV1 {
  schemaVersion: "fashion-product-offer-v1";
  offerId: string;
  sourceId: string;
  sellerId: string;
  sellerProductId: string;
  canonicalProductId: string;
  brandName: string;
  productName: string;
  category: string;
  colorFamily: string[];
  materialTags: string[];
  sizeSystem: string;
  availableSizes: string[];
  price: { amount: number; currency: "KRW" };
  listPrice: { amount: number; currency: "KRW" } | null;
  availability: "in-stock" | "low-stock" | "out-of-stock" | "unknown";
  shipsToKorea: boolean;
  productUrl: string;
  imageUrl: string | null;
  observedAt: string;
  expiresAt: string;
  sourceFingerprint: string;
}

export interface FashionOfferSnapshotV1 extends FashionProductOfferV1 {
  snapshotId: string;
  capturedForConsultationId: string;
  recommendationRevision: number;
  immutable: true;
}

export interface FashionOfferEligibilityInputV1 {
  now: string;
  compatibleSizes: string[];
  allowedHosts: string[];
  trustedSellerIds: string[];
  maxFreshnessMinutes?: number;
}

export interface FashionOfferEligibilityResultV1 {
  eligible: boolean;
  reasonCodes: string[];
}

export interface FashionOfferRevalidationV1 {
  snapshotId: string;
  state: "current" | "price-changed" | "replacement-required";
  checkedAt: string;
  currentOffer: FashionProductOfferV1 | null;
  reasonCodes: string[];
}

export interface FashionProductDisclosureV1 {
  observedAt: string;
  priceMayChange: true;
  availabilityMayChange: true;
  affiliateDisclosureRequired: boolean;
  imageDisplayAllowed: boolean;
}

export function isTrustedFashionProductUrl(value: string, allowedHosts: string[]) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && allowedHosts.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function evaluateFashionOfferEligibility(
  offer: FashionProductOfferV1,
  source: FashionProductSourceV1,
  input: FashionOfferEligibilityInputV1,
): FashionOfferEligibilityResultV1 {
  const reasonCodes: string[] = [];
  if (!source.enabled) reasonCodes.push("source-disabled");
  if (!input.trustedSellerIds.includes(offer.sellerId)) reasonCodes.push("seller-untrusted");
  if (!offer.shipsToKorea) reasonCodes.push("korea-shipping-unavailable");
  if (!(["in-stock", "low-stock"] as const).includes(offer.availability as "in-stock" | "low-stock")) reasonCodes.push("availability-unusable");
  if (input.compatibleSizes.length > 0 && !offer.availableSizes.some((size) => input.compatibleSizes.includes(size))) reasonCodes.push("size-unavailable");
  const now = Date.parse(input.now);
  const observedAt = Date.parse(offer.observedAt);
  const expiresAt = Date.parse(offer.expiresAt);
  if (!Number.isFinite(observedAt) || !Number.isFinite(expiresAt) || !Number.isFinite(now)) {
    reasonCodes.push("offer-time-invalid");
  } else {
    const freshnessMinutes = Math.min(source.refreshSlaMinutes, input.maxFreshnessMinutes ?? 24 * 60);
    if (observedAt > now + 5 * 60_000) reasonCodes.push("offer-observed-in-future");
    if (expiresAt <= now || now - observedAt > freshnessMinutes * 60_000) reasonCodes.push("offer-stale");
  }
  if (!isTrustedFashionProductUrl(offer.productUrl, input.allowedHosts.map((host) => host.toLowerCase()))) {
    reasonCodes.push("product-url-untrusted");
  }
  if (offer.imageUrl && source.imageUsagePolicy === "none") reasonCodes.push("image-display-not-licensed");
  if (!offer.brandName.trim() || !offer.productName.trim()) reasonCodes.push("product-identity-missing");
  if (!Number.isFinite(offer.price.amount) || offer.price.amount < 0 || offer.price.currency !== "KRW") reasonCodes.push("price-invalid");
  return { eligible: reasonCodes.length === 0, reasonCodes };
}
