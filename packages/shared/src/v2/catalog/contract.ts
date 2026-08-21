export type OfferingKey =
  | "free_hair_demo"
  | "full_style_once"
  | "full_style_quarterly"
  | "full_style_annual"
  | "hair_decision_once"
  | "total_style_seasonal"
  | "style_management_annual"
  | string;
export type PurchaseMode = "one_time" | "recurring";
export type BillingInterval = "month" | "quarter" | "year" | null;
export type CatalogStatus = "draft" | "active" | "retired";
export type PriceProvider = "portone" | "google_play" | "apple_iap" | "manual";

export interface OfferingCapabilities {
  acceptedHairPreviews: number;
  watermarkGeneratedAssets: boolean;
  hairRestartCount: number;
  finalHairSelectionCount: number;
  salonBrief: boolean;
  aftercare: boolean;
  aftercareConsultationCount: number;
  checkInDays: number[];
  personalColor: boolean;
  personalColorMode: "quick_photo" | "precision";
  hairColor: boolean;
  makeup: boolean;
  aiNarrative: boolean;
  pdf: boolean;
  fashionPreviews: number;
  fashionAdditionalPreviews: number;
  beforeAfterComparison: boolean;
  annualSummary: boolean;
  annualArchive: boolean;
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
