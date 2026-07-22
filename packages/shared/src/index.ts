import type { ProductCreditPolicySnapshot } from "./billing/policy-selectors";
import type { RefundRequestSummary } from "./billing/refund";

export * from "./billing/policy-selectors";
export * from "./billing/generation-credit";
export * from "./billing/paid-action";
export * from "./billing/refund";
export * from "./billing/subscription-policy";
export * from "./auth/resume-target";
export * from "./auth/generation-entry";
export * from "./fixtures/product-contract";
export * from "./fixtures/generation-selection";
export * from "./fixtures/generation-selection-lock";
export * from "./fixtures/generation-notification";
export * from "./generation/contract";
export * from "./generation/funnel";
export * from "./generation/notification";
export * from "./generation/notification-retention-policy";
export * from "./generation/original-retention-policy";
export * from "./generation/upload-validation";
export * from "./salon/connection-consent";
export * from "./styling/contract";

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
  styleTarget: MemberStyleTarget | null;
  preferredStyleTone: MemberStyleTone;
  accountSetupComplete: boolean;
  credits: number;
  planKey: string | null;
  services: MobileServiceKey[];
  degraded?: boolean;
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

export type MobileRefundRequest = RefundRequestSummary;

export interface MobileBillingPlanSummary {
  key: MobilePaymentPlan;
  label: string;
  priceKrw: number;
  credits: number;
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

export interface MobileConfirmedStyle {
  id: string;
  generationId: string | null;
  styleName: string;
  serviceType: ServiceType | string;
  serviceDate: string;
  nextVisitTargetDays: number;
  selectedVariantId: string | null;
  selectedVariantImageUrl: string | null;
  confirmedAt: string;
}

export interface MobileCustomerDashboard {
  credits: number;
  creditPolicy?: ProductCreditPolicySnapshot;
  billingPlans?: MobileBillingPlanSummary[];
  planKey: string | null;
  styleProfileReady: boolean;
  recentConfirmedStyles: MobileConfirmedStyle[];
  recentGenerations: MobileDashboardGeneration[];
  recentPayments: MobileDashboardPayment[];
  recentRefundRequests: MobileRefundRequest[];
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
  rangeDays: 7 | 30 | 90;
  kpis: {
    newUsers: number;
    paidOrders: number;
    revenueKrw: number;
    generationsCompleted: number;
    reviewsSubmitted: number;
    hiddenReviews: number;
    b2bLeads: number;
  };
  daily: Array<{
    date: string;
    newUsers: number;
    generationsCompleted: number;
    reviews: number;
    b2bLeads: number;
    paidOrders: number;
    revenueKrw: number;
  }>;
  leadStages: Array<{
    stage: "new" | "qualified" | "negotiation" | "contracted" | "dropped";
    count: number;
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

export type MobilePaymentPlan = "basic" | "standard" | "pro";

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
  observedPartingShape: string;
  recommendedPartingShape: string;
  partingStrategy: string;
  balance: string;
  bestLengthStrategy: string;
  volumeFocus: string[];
  avoidNotes: string[];
  summary: string;
}

export type RecommendationLengthBucket = "short" | "medium" | "long";
export type RecommendationCorrectionFocus = "crown" | "temple" | "jawline";
export type RecommendationVariantStatus = "queued" | "generating" | "completed" | "failed";
export type MemberStyleTarget = "male" | "female";
export type MemberStyleTone = "natural" | "trendy" | "soft" | "bold";

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
  styleTarget?: MemberStyleTarget;
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
  styleTarget?: MemberStyleTarget | null;
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
export type PersonalColorTone = "warm" | "cool" | "neutral";
export type PersonalColorContrast = "low" | "medium" | "high";
export type PersonalColorDetailVersion = "color-detail-v1";

export interface PersonalColorCombination {
  title: string;
  hexes: string[];
  reason: string;
}

export interface PersonalColorSwatch {
  nameKo: string;
  nameEn: string;
  hex: string;
  reason: string;
  recommendationReason?: string;
  nonRecommendationReason?: string;
  meaning?: string;
  stylingTip?: string;
  colorCombinations?: PersonalColorCombination[];
}

export interface PersonalColorResult {
  detailVersion?: PersonalColorDetailVersion;
  tone: PersonalColorTone;
  contrast: PersonalColorContrast;
  confidence: number;
  bestColors: PersonalColorSwatch[];
  avoidColors: PersonalColorSwatch[];
  stylingPalette: string[];
  hairColorHints: string[];
  summary: string;
  diagnosedAt: string;
  model: string;
}

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
  personalColor: PersonalColorResult | null;
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
  creditReceipt?: import("./billing/paid-action").PaidActionExecutionReceipt | null;
  completionNotificationStatus?:
    | "pending"
    | "sending"
    | "retry_wait"
    | "sent"
    | "skipped"
    | "dead_letter"
    | "delivery_unknown"
    | null;
  completionNotificationSentAt?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface HairstyleGenerationGroup<
  TAnalysis extends FaceAnalysisSummary = FaceAnalysisSummary,
  TVariant extends GeneratedVariant = GeneratedVariant,
> {
  id: string;
  createdAt: string;
  status: string;
  selectedVariantId: string | null;
  analysis: TAnalysis;
  variants: TVariant[];
}

export {
  needsKoreanDisplayTranslation,
  resolveKoreanDisplayCopy,
} from "./result/korean-display-copy";

export interface ConfirmedHairRecordSummary {
  id: string;
  styleName: string;
  serviceType: string;
  serviceDate: string;
  createdAt: string;
}

export interface GenerationStartApiResponse {
  generationId: string;
  status: import("./generation/contract").GenerationStatus;
  workflowInstanceId?: string;
  alreadyStarted?: boolean;
  terminal?: boolean;
}

export interface GenerationDraftApiResponse {
  draftId: string;
  clientRequestId: string;
  uploadedAt: string;
  expiresAt: string;
  state: "ready";
  alreadyUploaded: boolean;
}

export interface GenerationAcceptanceApiResponse {
  generationId: string;
  acceptedAt: string;
  preparationStatus: import("./generation/contract").GenerationPreparationStatus;
  backgroundStarted: boolean;
  workflowDispatchStatus: import("./generation/contract").GenerationWorkflowDispatchStatus;
  creditsRequired: number;
  creditReceipt: import("./billing/generation-credit").GenerationCreditReceipt | null;
  billingMode: "reserved_v1" | "legacy_unmanaged";
}

export interface GenerationStatusApiResponse {
  generationId: string;
  status: import("./generation/contract").GenerationStatus;
  terminal: boolean;
  variants: { total: number; completed: number; failed: number };
  updatedAt: string | null;
  acceptedAt?: string | null;
  preparationStatus?: import("./generation/contract").GenerationPreparationStatus;
  preparationError?: string | null;
  workflowInstanceId?: string | null;
  workflowStartedAt?: string | null;
  workflowDispatch?: {
    status: import("./generation/contract").GenerationWorkflowDispatchStatus;
    attemptCount: number;
    availableAt: string | null;
    dispatchedAt: string | null;
    updatedAt: string | null;
  } | null;
  notificationStatus?: string | null;
  creditReceipt?: import("./billing/generation-credit").GenerationCreditReceipt | null;
  creditReceiptUnavailable?: boolean;
  retryPath?: string;
  originalRetention?: import("./generation/original-retention-policy").GenerationOriginalRetentionState;
}

export interface GenerationDetailApiResponse<
  TRecommendationSet extends RecommendationSet = RecommendationSet,
  TVariant extends GeneratedVariant = GeneratedVariant,
> {
  id: string;
  status: import("./generation/contract").GenerationStatus;
  updatedAt?: string | null;
  acceptedAt?: string | null;
  preparationStatus?: import("./generation/contract").GenerationPreparationStatus;
  preparationError?: string | null;
  workflowInstanceId?: string | null;
  workflowStartedAt?: string | null;
  error?: string | null;
  promptUsed?: string | null;
  generatedImagePath?: string | null;
  options?: Record<string, unknown> | null;
  creditReceipt?: import("./billing/generation-credit").GenerationCreditReceipt | null;
  creditReceiptUnavailable?: boolean;
  retryPath?: string;
  originalRetention?: import("./generation/original-retention-policy").GenerationOriginalRetentionState;
  recommendationSet: TRecommendationSet | null;
  selectedVariantId: string | null;
  selectedVariant: TVariant | null;
  selectionLocked?: boolean;
  confirmedHairRecord?: ConfirmedHairRecordSummary | null;
}

export interface GenerationSelectionApiResponse {
  ok: true;
  selectedVariantId: string;
  selectionLocked?: boolean;
  confirmedHairRecord?: ConfirmedHairRecordSummary | null;
}

export type MobilePushPermissionStatus = "granted" | "denied" | "undetermined";
export type MobilePushPlatform = "ios" | "android";

export interface MobilePushDeviceRegistrationRequest {
  installationId: string;
  expoPushToken: string;
  nativePushToken?: string | null;
  platform: MobilePushPlatform;
  projectId: string;
  appVersion?: string | null;
}

export interface MobilePushDeviceRegistrationResponse {
  deviceId: string;
  installationId: string;
  enabled: boolean;
  permissionStatus: MobilePushPermissionStatus;
  registeredAt: string;
}

export interface MobilePushDeviceStatusResponse {
  installationId: string;
  registered: boolean;
  enabled: boolean;
  permissionStatus: MobilePushPermissionStatus;
  lastRegisteredAt: string | null;
  invalidReason: string | null;
}

export interface MobilePushDeviceRevocationResponse {
  installationId: string;
  revoked: boolean;
}

export interface StylingProfileApiResponse {
  profile?: StyleProfile;
  error?: string;
}

export interface StylingProfileApiSuccess {
  profile: StyleProfile;
}

export interface StylingRecommendApiResponse<
  TRecommendation extends FashionRecommendation = FashionRecommendation,
  TProfile extends StyleProfile = StyleProfile,
  TVariant extends GeneratedVariant = GeneratedVariant,
> {
  sessionId?: string | null;
  status?: string;
  recommendation?: TRecommendation;
  profile?: TProfile;
  selectedVariant?: TVariant;
  error?: string;
}

export interface StylingRecommendApiSuccess {
  sessionId: string | null;
  status: string;
  recommendation: FashionRecommendation;
  profile: StyleProfile;
  selectedVariant: GeneratedVariant;
}

export interface StylingGenerateApiResponse {
  sessionId?: string;
  status?: string;
  imageUrl?: string | null;
  imagePath?: string | null;
  chargedCredits?: number;
  quote?: import("./billing/paid-action").PaidActionQuote;
  creditReceipt?: import("./billing/paid-action").PaidActionExecutionReceipt | null;
  inProgress?: boolean;
  alreadyCompleted?: boolean;
  backgroundStarted?: boolean;
  workflowDispatchStatus?: "started" | "deferred";
  workflowRuntime?: "cloudflare" | "local" | "unavailable";
  error?: string;
  code?: import("./billing/paid-action").PaidActionQuoteErrorCode | string;
}

export interface StylingQuoteApiResponse {
  quote?: import("./billing/paid-action").PaidActionQuote;
  error?: string;
}

export interface StylingHairstyleListApiResponse<
  TGeneration extends HairstyleGenerationGroup = HairstyleGenerationGroup,
> {
  generations?: TGeneration[];
  error?: string;
}

export interface StylingHairstyleListApiSuccess {
  generations: HairstyleGenerationGroup[];
}

export interface StylingSessionApiResponse {
  session?: StylingSessionDetails;
  error?: string;
}

export interface StylingSessionApiSuccess {
  session: StylingSessionDetails;
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
  selectedVariantId: string | null;
  selectedVariantImageUrl: string | null;
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
export * from "./account-deletion";
