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
  selectedVariantLabel: string | null;
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

export interface MobileCustomerDashboard {
  credits: number;
  planKey: string | null;
  recentGenerations: MobileDashboardGeneration[];
  recentPayments: MobileDashboardPayment[];
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
  { webRoute: "/salon/customers", mobileRoute: "/customers", service: "salon", status: "scaffolded", notes: "CRM list" },
  { webRoute: "/admin/stats", mobileRoute: "/stats", service: "admin", status: "scaffolded", notes: "KPI view" },
];
