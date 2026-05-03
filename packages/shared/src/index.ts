export type MobileServiceKey = "customer" | "salon" | "admin";

export type PortStatus = "inventory" | "scaffolded" | "ported" | "verified";

export interface MobileRoutePort {
  webRoute: string;
  mobileRoute: string;
  service: MobileServiceKey;
  status: PortStatus;
  notes: string;
}

export interface MobileBootstrap {
  userId: string;
  email: string | null;
  displayName: string | null;
  accountType: "member" | "salon_owner" | "admin" | null;
  onboardingComplete: boolean;
  credits: number;
  planKey: string | null;
  services: MobileServiceKey[];
}

export interface MobileDashboardGeneration {
  id: string;
  status: string;
  promptUsed: string | null;
  generatedImagePath: string | null;
  selectedVariantId: string | null;
  selectedVariantLabel: string | null;
  selectedVariantImageUrl: string | null;
  completedVariantCount: number;
  totalVariantCount: number;
  createdAt: string;
}

export interface MobileDashboardPayment {
  id: string;
  status: string;
  amountKrw: number;
  creditsToGrant: number;
  paidAt: string | null;
  createdAt: string;
}

export interface MobileDashboardStylingSession {
  id: string;
  generationId: string;
  selectedVariantId: string;
  genre: string | null;
  occasion: string | null;
  mood: string | null;
  headline: string | null;
  summary: string | null;
  status: string;
  errorMessage: string | null;
  creditsUsed: number;
  generatedImagePath: string | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface MobileCustomerDashboard {
  credits: number;
  planKey: string | null;
  styleProfileReady: boolean;
  recentGenerations: MobileDashboardGeneration[];
  recentPayments: MobileDashboardPayment[];
  recentStylingSessions: MobileDashboardStylingSession[];
}

export interface MobileSalonDashboard {
  summary: {
    totalCustomers: number;
    linkedMembers: number;
    pendingAftercare: number;
    dueToday: number;
  };
  recentCustomers: Array<{
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    nextFollowUpAt: string | null;
    updatedAt: string;
  }>;
}

export interface MobileAdminDashboard {
  kpis: {
    newUsers: number;
    paidOrders: number;
    revenueKrw: number;
    generationsCompleted: number;
    reviewsSubmitted: number;
    b2bLeads: number;
  };
  daily: Array<{
    date: string;
    newUsers: number;
    generationsCompleted: number;
    paidOrders: number;
    revenueKrw: number;
  }>;
}

export type MobileDashboard =
  | {
      service: "customer";
      generatedAt: string;
      customer: MobileCustomerDashboard;
    }
  | {
      service: "salon";
      generatedAt: string;
      salon: MobileSalonDashboard;
    }
  | {
      service: "admin";
      generatedAt: string;
      admin: MobileAdminDashboard;
    };

export type MobilePaymentPlan = "basic" | "standard" | "pro" | "salon";

export interface MobilePaymentPrepareResponse {
  paymentId: string;
  plan: MobilePaymentPlan;
  orderName: string;
  amountKrw: number;
  credits: number;
  customerId: string;
  redirectUrl: string;
  appScheme: string;
  storeId: string;
  channelKey?: string;
}

export interface MobilePaymentCompleteResponse {
  ok: true;
  paymentId: string;
  status: "paid";
  transactionId: string;
  creditsGranted: number;
  plan: MobilePaymentPlan;
  ledgerId: string | number | null;
}

export type PipelineStage =
  | "idle"
  | "validating"
  | "analyzing_face"
  | "building_grid"
  | "generating_image"
  | "finalizing"
  | "completed"
  | "failed";

export interface FaceAnalysisSummary {
  faceShape: string;
  headShape: string;
  foreheadExposure: string;
  balance: string;
  bestLengthStrategy: string;
  volumeFocus: string[];
  avoidNotes: string[];
  summary: string;
}

export type RecommendationLengthBucket = "short" | "medium" | "long";
export type RecommendationCorrectionFocus = "crown" | "temple" | "jawline";
export type RecommendationVariantStatus = "queued" | "generating" | "completed" | "failed";

export interface GeneratedVariant {
  id: string;
  rank: number;
  label: string;
  reason: string;
  prompt: string;
  negativePrompt: string;
  tags: string[];
  lengthBucket: RecommendationLengthBucket;
  correctionFocus: RecommendationCorrectionFocus;
  promptArtifactToken?: string;
  catalogItemId?: string;
  catalogCycleId?: string;
  selectionScore?: number;
  promptTemplateVersion?: string;
  status: RecommendationVariantStatus;
  outputUrl: string | null;
  generatedImagePath: string | null;
  evaluation: unknown | null;
  designerBrief: unknown | null;
  error: string | null;
  generatedAt: string | null;
}

export interface RecommendationSet {
  generatedAt: string;
  analysis: FaceAnalysisSummary;
  variants: GeneratedVariant[];
  selectedVariantId: string | null;
  catalogCycleId?: string | null;
  creditChargedAt?: string | null;
  creditChargeAmount?: number | null;
}

export type FashionGenre =
  | "minimal"
  | "street"
  | "casual"
  | "classic"
  | "office"
  | "date"
  | "formal"
  | "athleisure";

export type FashionOccasion = "daily" | "work" | "date" | "formal";
export type FashionMood = "minimal" | "trendy" | "soft" | "classic";
export type BodyShape = "straight" | "hourglass" | "triangle" | "inverted_triangle" | "round";
export type FitPreference = "regular" | "slim" | "relaxed" | "oversized";
export type ExposurePreference = "low" | "balanced" | "bold";
export type FashionItemSlot = "outer" | "top" | "bottom" | "shoes" | "accessory";
export type ServiceType = "perm" | "color" | "cut" | "bleach" | "treatment" | "other";
export type AftercareSectionKey = "dry" | "treatment" | "iron" | "styling";

export interface StyleProfile {
  userId: string;
  heightCm: number | null;
  bodyShape: BodyShape | null;
  topSize: string | null;
  bottomSize: string | null;
  fitPreference: FitPreference | null;
  colorPreference: string | null;
  exposurePreference: ExposurePreference | null;
  avoidItems: string[];
  bodyPhotoPath: string | null;
  bodyPhotoUrl?: string | null;
  bodyPhotoConsentAt: string | null;
  updatedAt: string | null;
}

export interface FashionRecommendationItem {
  slot: FashionItemSlot;
  name: string;
  description: string;
  color: string;
  fit: string;
  material: string;
  brandName: string | null;
  productUrl: string | null;
}

export interface FashionRecommendation {
  headline: string;
  summary: string;
  genre: FashionGenre;
  occasion?: FashionOccasion;
  mood?: FashionMood;
  palette: string[];
  silhouette: string;
  items: FashionRecommendationItem[];
  stylingNotes: string[];
  catalogItemId?: string | null;
  catalogCycleId?: string | null;
  generatedAt: string;
}

export interface StylingSessionDetails {
  id: string;
  generationId: string;
  selectedVariantId: string;
  genre: FashionGenre | null;
  occasion: string;
  mood: string;
  recommendation: FashionRecommendation;
  status: string;
  errorMessage: string | null;
  creditsUsed: number;
  generatedImagePath?: string | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface HairstyleGenerationGroup {
  id: string;
  createdAt: string;
  status: string;
  selectedVariantId: string | null;
  analysis: FaceAnalysisSummary;
  variants: GeneratedVariant[];
}

export interface AftercareGuideSection {
  title: string;
  goal: string;
  timing: string;
  steps: string[];
  products: string[];
  avoid: string[];
}

export interface AftercareGuide {
  overview: {
    styleName: string;
    serviceType: ServiceType;
    headline: string;
    summary: string;
    serviceDate: string;
  };
  sections: Record<AftercareSectionKey, AftercareGuideSection>;
  maintenanceSchedule: Array<{
    dayOffset: number;
    label: string;
    description: string;
  }>;
  warnings: string[];
  recommendedNextActions: string[];
}

export interface MobileAftercareRecord {
  id: string;
  generationId: string | null;
  styleName: string;
  serviceType: ServiceType | string;
  serviceDate: string;
  nextVisitTargetDays: number;
  createdAt: string;
}

export interface MobileAftercareListResponse {
  records: MobileAftercareRecord[];
}

export interface MobileAftercareGuideResponse {
  record: MobileAftercareRecord;
  guide: AftercareGuide;
}

export const mobileServices: Array<{
  key: MobileServiceKey;
  title: string;
  description: string;
}> = [
  {
    key: "customer",
    title: "HairFit",
    description: "Upload portraits, generate hairstyle boards, style outfits, and manage credits.",
  },
  {
    key: "salon",
    title: "HairFit Salon",
    description: "Manage customers, matching, visits, and aftercare tasks.",
  },
  {
    key: "admin",
    title: "HairFit Admin",
    description: "Operate stats, members, reviews, inbound emails, B2B leads, and catalogs.",
  },
];

export const initialMobileRoutePorts: MobileRoutePort[] = [
  { webRoute: "/", mobileRoute: "/", service: "customer", status: "scaffolded", notes: "Home hub" },
  { webRoute: "/upload", mobileRoute: "/upload", service: "customer", status: "scaffolded", notes: "Image picker flow" },
  { webRoute: "/generate", mobileRoute: "/generate", service: "customer", status: "scaffolded", notes: "Pipeline entry" },
  { webRoute: "/mypage", mobileRoute: "/mypage", service: "customer", status: "scaffolded", notes: "Dashboard" },
  { webRoute: "/salon/customers", mobileRoute: "/salon/customers", service: "salon", status: "scaffolded", notes: "CRM list" },
  { webRoute: "/admin/stats", mobileRoute: "/admin/stats", service: "admin", status: "scaffolded", notes: "KPI view" },
];
