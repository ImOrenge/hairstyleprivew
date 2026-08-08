export type OfferingKey = "hair_decision_once" | "total_style_seasonal" | "style_management_annual" | string;
export type PurchaseMode = "one_time" | "recurring";
export type BillingInterval = "month" | "quarter" | "year" | null;
export type CatalogStatus = "draft" | "active" | "retired";
export type PriceProvider = "portone" | "google_play" | "apple_iap" | "manual";

export interface OfferingCapabilities {
  acceptedHairPreviews: number;
  salonBrief: boolean;
  aftercare: boolean;
  personalColor: boolean;
  fashionPreviews: number;
  generatedAssetRetentionDays: number | null;
}

export interface ProductPriceV2 {
  id: string;
  version: number;
  provider: PriceProvider;
  providerProductId: string | null;
  currency: string;
  amountMinor: number;
  status: CatalogStatus;
  validFrom: string | null;
  validUntil: string | null;
}

export interface ProductOfferingV2 {
  id: string;
  key: OfferingKey;
  version: number;
  internalName: string;
  customerName: string | null;
  description: string;
  purchaseMode: PurchaseMode;
  billingInterval: BillingInterval;
  status: CatalogStatus;
  includedConsultationSessions: number;
  releasePolicy: string | null;
  capabilities: OfferingCapabilities;
  prices: ProductPriceV2[];
}

export interface OfferCatalogV2 {
  schemaVersion: "offer-catalog-v1";
  catalogVersion: string;
  generatedAt: string;
  offerings: ProductOfferingV2[];
}
