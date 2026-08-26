import type {
  AccountDeletionResponse,
  GeneratedVariant,
  GenerationAcceptanceApiResponse,
  GenerationCreditReceipt,
  GenerationDetailApiResponse,
  GenerationOriginalRetentionState,
  GenerationDraftApiResponse,
  GenerationFunnelClientSource,
  GenerationSelectionApiResponse,
  GenerationStartApiResponse,
  GenerationStatus,
  GenerationStatusApiResponse,
  MobileAftercareGuideResponse,
  MobileAftercareListResponse,
  MobileBootstrap,
  MobileDashboard,
  CustomerStylebookV2,
  CustomerStylebookConsultationReferenceContextV2,
  CustomerStylebookCollectionMutationV2,
  CustomerStylebookItemStatePatchV2,
  CustomerStylebookShareRequestV2,
  CustomerStylebookWearLogRequestV2,
  MobilePaymentCompleteResponse,
  MobilePaymentPlan,
  MobilePaymentPrepareResponse,
  MobileGooglePlayCatalogResponse,
  MobileGooglePlayPurchaseIntentRequest,
  MobileGooglePlayPurchaseIntentResponse,
  MobileGooglePlayPurchaseVerificationRequest,
  MobileGooglePlayPurchaseVerificationResponse,
  MobilePushDeviceRegistrationRequest,
  MobilePushDeviceRegistrationResponse,
  MobilePushDeviceRevocationResponse,
  MobilePushDeviceStatusResponse,
  PaidActionQuoteRequest,
  PaidActionQuoteResponse,
  PaidActionExecutionReceipt,
  RefundQuoteRequest,
  RefundQuoteResponse,
  RefundRequestResponse,
  RefundRequestSummary,
  RefundRequestSubmission,
  PersonalColorResult,
  RecommendationSet,
  ServiceType,
  StyleProfile,
  FashionGenre,
  StylingGenerateApiResponse,
  StylingHairstyleListApiSuccess,
  StylingProfileApiSuccess,
  StylingRecommendApiSuccess,
  StylingSessionApiSuccess,
  MemberStyleTarget,
  MemberStyleTone,
  SalonConnectionConsentAcceptance,
  ConsultationPatch,
  ConsultationSnapshot,
  ConsultationStartContextV1,
  EffectiveConsultationIntentV3,
  OptionalOpeningIntent,
  PhotoFaceDetectionEvidence,
  PhotoSnapshot,
  ConsultationKindV2,
  ConsultationSessionV2,
  EntitlementDecisionV2,
  OfferCatalogV2,
  PreviewBoardV2,
  HairRecommendationDecisionV1,
  HairAdjustmentAspect,
  SalonBriefV2,
  AftercareProgramV2,
  AnalysisEvidenceV2,
  EvidenceCorrectionTargetV2,
  NormalizedPointV2,
  FashionPreviewCandidateV2,
  FashionPreviewSetV2,
  FashionPreviewBatch,
  FashionDirectionSnapshot,
  StyleSelectionSnapshotV2,
  PersonalColorProfileV2,
  PersonalColorDrapeSessionV2,
  PersonalColorDrapePairV2,
  PersonalColorDrapePreferenceV2,
  PersonalColorDrapeResponseV2,
  MakeupArtistBrief,
  CapabilityResult,
  MakeupContextProfile,
  MakeupDirectionSnapshot,
  MakeupModule,
  MakeupModulePatch,
  HairProfileV2,
  HairTraitAnalysisRunV1,
  DiagnosticQuestionInstanceV1,
  MakeupSimulationRunV1,
  MakeupSimulationOutputV1,
  MakeupSimulationSelectionSnapshotV1,
  MakeupRoutine,
  MakeupSemanticProjectionV3,
  MakeupSourceStaleReason,
  UserFashionPersonalizationPolicyV1,
  FashionPolicyCoverageV1,
  ConsultationFashionContextV1,
  FashionPersonalizationSnapshotV1,
  FashionRankedOfferV2,
  ConsultationReportViewModelV2,
} from "@hairfit/shared";

export { LatestRequestGuard } from "./latest-request-guard";
export type { GenerationStatus };

export interface HairfitApiClientOptions {
  baseUrl: string;
  getAuthToken?: (options?: {
    skipCache?: boolean;
  }) => Promise<string | null> | string | null;
  fetchImpl?: typeof fetch;
}

export interface ApiRequestOptions extends RequestInit {
  auth?: boolean;
}

export type GenerationStartResponse = GenerationStartApiResponse;
export type GenerationDraftResponse = GenerationDraftApiResponse;
export type GenerationAcceptanceResponse = GenerationAcceptanceApiResponse;
export type GenerationStatusResponse = GenerationStatusApiResponse;

export interface CurrentHairProfileInput {
  currentLength: "short" | "medium" | "long" | "unknown";
  textureType: "straight" | "wavy_curly" | "tight_curly_frizzy" | "unknown";
  strandThickness: "fine" | "medium" | "coarse" | "unknown";
  conditionTags: Array<
    | "untreated"
    | "damaged"
    | "bleached"
    | "colored"
    | "permed"
    | "severely_damaged"
  >;
  damageLevel: "low" | "medium" | "high" | "unknown";
  desiredLength?: "short" | "medium" | "long" | null;
  source?: "user" | "salon" | "image_estimate" | "unknown";
}

export interface AccountStatus {
  accountSetupComplete: boolean;
  accountType: MobileBootstrap["accountType"];
  memberProfile?: {
    displayName?: string;
    styleTarget?: MemberStyleTarget | null;
    preferredStyleTone?: MemberStyleTone;
  } | null;
  salonProfile?: Record<string, unknown> | null;
  redirectTo?: string;
  degraded?: boolean;
  error?: string;
}

export interface AdminMemberListRow {
  id: string;
  email: string | null;
  display_name: string | null;
  account_type: string | null;
  credits: number | null;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminMemberDetailResponse {
  user: Record<string, unknown>;
  profiles: {
    member: Record<string, unknown> | null;
    salon: Record<string, unknown> | null;
    style: Record<string, unknown> | null;
  };
  activity: {
    generations: Record<string, unknown>[];
    stylingSessions: Record<string, unknown>[];
    hairRecords: Record<string, unknown>[];
    payments: Record<string, unknown>[];
    creditLedger: Record<string, unknown>[];
    subscriptions: Record<string, unknown>[];
  };
  salon: {
    customers: Record<string, unknown>[];
    aftercareTasks: Record<string, unknown>[];
  };
}

export interface AdminReviewRow {
  id: string;
  user_id: string;
  generation_id: string;
  rating: number;
  comment: string;
  is_hidden: boolean;
  hidden_reason: string | null;
  hidden_at: string | null;
  hidden_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminInboundEmailRow {
  id: string;
  provider: string;
  mailbox: "support" | "business" | "general";
  message_id: string | null;
  envelope_from: string;
  envelope_to: string;
  header_from: string | null;
  header_to: string[];
  subject: string;
  text_body: string | null;
  html_body: string | null;
  body_preview: string;
  attachments: unknown[];
  status: "new" | "read" | "archived";
  admin_note: string | null;
  in_reply_to: string | null;
  reference_ids: string[];
  raw_size: number;
  received_at: string;
  created_at: string;
  updated_at: string;
}

export interface AdminB2bLeadRow {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  message: string;
  stage: "new" | "qualified" | "negotiation" | "contracted" | "dropped";
  source: "public_form" | "admin_manual";
  owner_admin_user_id: string | null;
  owner_note: string | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
  plan_interest: string | null;
  region: string | null;
  shop_count: number | null;
  seat_count: number | null;
  monthly_clients: number | null;
  current_tools: string | null;
  desired_timeline: string | null;
  budget_range: string | null;
  source_page: string | null;
  webhook_delivered: boolean;
  webhook_error: string | null;
}

export interface SalonCustomer {
  id: string;
  linkedUserId: string | null;
  source: "manual" | "linked_member";
  name: string;
  phone: string;
  email: string;
  memo: string;
  consentSms: boolean;
  consentKakao: boolean;
  styleTarget: "male" | "female" | null;
  photoGenerationConsentAt: string | null;
  lastVisitAt: string | null;
  nextFollowUpAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isLinkedMember: boolean;
}

export interface SalonVisit {
  id: string;
  customerId: string;
  generationId: string | null;
  selectedVariantId: string | null;
  styleLabel: string | null;
  serviceType: string | null;
  designerBrief: Record<string, unknown> | null;
  visitedAt: string;
  serviceNote: string;
  memo: string;
  nextRecommendedVisitAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SalonAftercareTask {
  id: string;
  customerId: string;
  channel: "sms" | "kakao" | "phone" | "manual";
  status: "pending" | "done" | "canceled";
  scheduledFor: string;
  templateKey: string | null;
  note: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SalonCustomerDetailResponse {
  customer: SalonCustomer;
  visits: SalonVisit[];
  aftercareTasks: SalonAftercareTask[];
  connection: SalonConnection | null;
  linkedMember: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  } | null;
  linkedMemberGenerations: Array<{
    id: string;
    status: string;
    promptUsed: string | null;
    styleLabel: string | null;
    generatedImagePath: string | null;
    createdAt: string;
  }>;
  linkedMemberHairRecords: Array<{
    id: string;
    generationId: string | null;
    styleName: string;
    serviceType: string;
    serviceDate: string;
    createdAt: string;
  }>;
}

export interface SalonConnection {
  id: string;
  ownerUserId: string;
  memberUserId: string;
  status: "pending" | "linked" | "revoked";
  linkedCustomerId: string | null;
  consentVersion: string | null;
  consentScope: Record<string, unknown> | null;
  consentedAt: string | null;
  linkedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SalonMatchCandidate {
  id: string;
  ownerUserId: string;
  memberUserId: string;
  inviteId: string | null;
  status: "pending" | "linked" | "revoked";
  linkedCustomerId: string | null;
  consentVersion: string | null;
  consentScope: Record<string, unknown> | null;
  consentedAt: string | null;
  linkedAt: string | null;
  revokedAt: string | null;
  revokedByUserId: string | null;
  revocationReason: string | null;
  createdAt: string;
  updatedAt: string;
  member: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export interface SalonMemberConnection extends SalonConnection {
  salon: {
    shopName: string;
    managerName: string;
    contactPhone: string;
    region: string;
  };
}

export interface SalonMatchInviteResponse {
  authenticated: boolean;
  existingStatus: string | null;
  existingMatchRequestId: string | null;
  existingConsentedAt: string | null;
  salon: {
    ownerUserId: string;
    shopName: string;
    managerName: string;
    contactPhone: string;
    region: string;
    instagramHandle: string;
    introduction: string;
  };
  invite: {
    code: string;
    expiresAt: string | null;
    consentVersion: string;
  };
  consent: {
    version: string;
    scope: Record<string, unknown>;
    copy: {
      purpose: string;
      sharedItems: readonly string[];
      excludedItems: readonly string[];
      retention: string;
      revocation: string;
    };
  };
}

export class HairfitApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "HairfitApiError";
    this.status = status;
    this.payload = payload;
  }
}

function appendParam(
  params: URLSearchParams,
  key: string,
  value: string | number | null | undefined,
) {
  if (value === null || value === undefined || value === "") return;
  params.set(key, String(value));
}

function querySuffix(params: URLSearchParams) {
  const text = params.toString();
  return text ? `?${text}` : "";
}

export class HairfitApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly getAuthToken?: HairfitApiClientOptions["getAuthToken"];

  constructor(options: HairfitApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.getAuthToken = options.getAuthToken;
  }

  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const headers = new Headers(options.headers);
    const shouldAttachAuth = options.auth !== false;

    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }

    if (
      options.body &&
      !(options.body instanceof FormData) &&
      !headers.has("Content-Type")
    ) {
      headers.set("Content-Type", "application/json");
    }

    if (shouldAttachAuth && this.getAuthToken) {
      const token = await this.getAuthToken();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    }

    const execute = () =>
      this.fetchImpl(`${this.baseUrl}${path}`, {
        credentials: "include",
        ...options,
        headers,
      });
    let response = await execute();

    if (response.status === 401 && shouldAttachAuth && this.getAuthToken) {
      try {
        const refreshedToken = await this.getAuthToken({ skipCache: true });
        if (refreshedToken) {
          headers.set("Authorization", `Bearer ${refreshedToken}`);
          response = await execute();
        }
      } catch {
        // Preserve the original 401 so callers can route to sign-in with context.
      }
    }
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : `HairFit API request failed with ${response.status}`;
      throw new HairfitApiError(message, response.status, payload);
    }

    return payload as T;
  }

  createConsultation(idempotencyKey?: string) {
    return this.request<{ snapshot: ConsultationSnapshot }>(
      "/api/consultations",
      {
        method: "POST",
        ...(idempotencyKey
          ? { headers: { "Idempotency-Key": idempotencyKey } }
          : {}),
      },
    );
  }

  getLatestConsultation() {
    return this.request<{ snapshot: ConsultationSnapshot | null }>(
      "/api/consultations",
    );
  }

  getConsultation(sessionId: string) {
    return this.request<{ snapshot: ConsultationSnapshot }>(
      `/api/consultations/${encodeURIComponent(sessionId)}`,
    );
  }

  updateConsultation(sessionId: string, patch: ConsultationPatch) {
    return this.request<{ snapshot: ConsultationSnapshot }>(
      `/api/consultations/${encodeURIComponent(sessionId)}`,
      {
        method: "PATCH",
        headers: { "If-Match": String(patch.expectedVersion) },
        body: JSON.stringify(patch),
      },
    );
  }

  getConsultationStartContext(sessionId: string) {
    return this.request<{ startContext: ConsultationStartContextV1 | null; effectiveIntent: EffectiveConsultationIntentV3; version: number }>(
      `/api/v2/consultations/${encodeURIComponent(sessionId)}/start-context`,
    );
  }

  updateConsultationStartContext(sessionId: string, input: { expectedVersion: number; optionalOpeningIntent?: OptionalOpeningIntent | null; optionalNote?: string | null }) {
    return this.request<{ snapshot: ConsultationSnapshot; startContext: ConsultationStartContextV1; effectiveIntent: EffectiveConsultationIntentV3 }>(
      `/api/v2/consultations/${encodeURIComponent(sessionId)}/start-context`,
      { method: "PATCH", body: JSON.stringify(input) },
    );
  }

  refreshConsultationAssets(sessionId: string, expectedVersion: number) {
    return this.request<{ snapshot: ConsultationSnapshot }>(
      `/api/consultations/${encodeURIComponent(sessionId)}/refresh-assets`,
      {
        method: "POST",
        body: JSON.stringify({ expectedVersion }),
      },
    );
  }

  createConsultationShare(sessionId: string, hours: 24 | 168 | 720) {
    return this.request<{ token: string; expiresAt: string }>(
      `/api/consultations/${encodeURIComponent(sessionId)}/share`,
      { method: "POST", body: JSON.stringify({ hours }) },
    );
  }

  revokeConsultationShare(sessionId: string) {
    return this.request<{ revokedAt: string }>(
      `/api/consultations/${encodeURIComponent(sessionId)}/share`,
      { method: "DELETE" },
    );
  }

  getMobileMe() {
    return this.request<MobileBootstrap>("/api/mobile/me");
  }

  getMobilePushDeviceStatus(installationId: string) {
    const params = new URLSearchParams({ installationId });
    return this.request<MobilePushDeviceStatusResponse>(
      `/api/mobile/push-devices?${params.toString()}`,
    );
  }

  registerMobilePushDevice(input: MobilePushDeviceRegistrationRequest) {
    return this.request<MobilePushDeviceRegistrationResponse>(
      "/api/mobile/push-devices",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  revokeMobilePushDevice(installationId: string, reason = "user_disabled") {
    return this.request<MobilePushDeviceRevocationResponse>(
      "/api/mobile/push-devices",
      {
        method: "DELETE",
        body: JSON.stringify({ installationId, reason }),
      },
    );
  }

  getAccountStatus() {
    return this.request<AccountStatus>("/api/account");
  }

  deleteAccount(confirmation: string) {
    return this.request<AccountDeletionResponse>("/api/account", {
      method: "DELETE",
      body: JSON.stringify({ confirmation }),
    });
  }

  getMobileDashboard(
    service: "customer" | "salon" | "admin",
    options: { range?: 7 | 30 | 90 } = {},
  ) {
    const params = new URLSearchParams({ service });
    if (options.range) {
      params.set("range", String(options.range));
    }

    return this.request<MobileDashboard>(
      `/api/mobile/dashboard?${params.toString()}`,
    );
  }

  getCustomerStylebookV2() {
    return this.request<CustomerStylebookV2>("/api/mobile/stylebook");
  }

  getCustomerStylebookReferenceV2(consultationId: string) {
    return this.request<{ reference: CustomerStylebookConsultationReferenceContextV2 | null }>(
      `/api/mobile/stylebook?referenceConsultationId=${encodeURIComponent(consultationId)}`,
    );
  }

  updateCustomerStylebookItemStateV2(input: CustomerStylebookItemStatePatchV2) {
    return this.request<{ state: CustomerStylebookV2["hair"][number]["state"] }>(
      "/api/mobile/stylebook",
      { method: "PATCH", body: JSON.stringify(input) },
    );
  }

  mutateCustomerStylebookCollectionV2(input: CustomerStylebookCollectionMutationV2) {
    return this.request<Record<string, unknown>>("/api/mobile/stylebook", {
      method: "POST",
      body: JSON.stringify({ action: "collection", collection: input }),
    });
  }

  createCustomerStylebookWearLogV2(
    value: CustomerStylebookWearLogRequestV2,
    photo?: { uri: string; name: string; type: string } | null,
    photoConsent = false,
  ) {
    const formData = new FormData();
    formData.append("value", JSON.stringify(value));
    if (photo) formData.append("file", photo as unknown as Blob);
    formData.append("photoConsent", String(photoConsent));
    return this.request<{ id: string }>("/api/mobile/stylebook", {
      method: "POST",
      body: formData,
    });
  }

  deleteCustomerStylebookWearLogV2(id: string) {
    return this.request<{ deleted: boolean }>("/api/mobile/stylebook", {
      method: "DELETE",
      body: JSON.stringify({ action: "wear_log", id }),
    });
  }

  createCustomerStylebookShareV2(input: CustomerStylebookShareRequestV2) {
    return this.request<{ id: string; token: string; expiresAt: string }>(
      "/api/mobile/stylebook",
      { method: "POST", body: JSON.stringify({ action: "share", share: input }) },
    );
  }

  revokeCustomerStylebookShareV2(id: string) {
    return this.request<{ revokedAt: string }>("/api/mobile/stylebook", {
      method: "DELETE",
      body: JSON.stringify({ action: "share", id }),
    });
  }

  createCustomerStylebookReferencedConsultationV2(item: CustomerStylebookShareRequestV2["item"]) {
    return this.request<{ snapshot: ConsultationSnapshot }>("/api/mobile/stylebook", {
      method: "POST",
      body: JSON.stringify({ action: "reference", item }),
    });
  }

  listAdminMembers(
    options: {
      q?: string;
      accountType?: string;
      limit?: number;
      cursor?: string;
    } = {},
  ) {
    const params = new URLSearchParams();
    appendParam(params, "q", options.q);
    appendParam(params, "accountType", options.accountType);
    appendParam(params, "limit", options.limit);
    appendParam(params, "cursor", options.cursor);
    return this.request<{
      members: AdminMemberListRow[];
      total: number;
      limit: number;
      nextCursor: string | null;
    }>(`/api/admin/members${querySuffix(params)}`);
  }

  getAdminMember(userId: string) {
    return this.request<AdminMemberDetailResponse>(
      `/api/admin/members/${encodeURIComponent(userId)}`,
    );
  }

  listAdminReviews(
    options: {
      q?: string;
      visibility?: "visible" | "hidden";
      limit?: number;
      cursor?: string;
    } = {},
  ) {
    const params = new URLSearchParams();
    appendParam(params, "q", options.q);
    appendParam(params, "visibility", options.visibility);
    appendParam(params, "limit", options.limit);
    appendParam(params, "cursor", options.cursor);
    return this.request<{
      reviews: AdminReviewRow[];
      total: number;
      limit: number;
      nextCursor: string | null;
    }>(`/api/admin/reviews${querySuffix(params)}`);
  }

  createRefundQuote(input: RefundQuoteRequest) {
    return this.request<RefundQuoteResponse>("/api/payments/refund-quotes", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  submitRefundRequest(input: RefundRequestSubmission) {
    return this.request<RefundRequestResponse>(
      "/api/payments/refund-requests",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  getRefundRequest(requestId: string) {
    return this.request<{ refundRequest: RefundRequestSummary }>(
      `/api/payments/refund-requests/${encodeURIComponent(requestId)}`,
    );
  }

  listAdminInboundEmails(
    options: {
      q?: string;
      status?: "new" | "read" | "archived";
      mailbox?: "support" | "business" | "general";
      limit?: number;
      cursor?: string;
    } = {},
  ) {
    const params = new URLSearchParams();
    appendParam(params, "q", options.q);
    appendParam(params, "status", options.status);
    appendParam(params, "mailbox", options.mailbox);
    appendParam(params, "limit", options.limit);
    appendParam(params, "cursor", options.cursor);
    return this.request<{
      emails: AdminInboundEmailRow[];
      total: number;
      statusSummary: Array<{
        status: AdminInboundEmailRow["status"];
        count: number;
      }>;
      mailboxSummary: Array<{
        mailbox: AdminInboundEmailRow["mailbox"];
        count: number;
      }>;
      limit: number;
      nextCursor: string | null;
    }>(`/api/admin/inbound-emails${querySuffix(params)}`);
  }

  listAdminB2bLeads(
    options: {
      q?: string;
      stage?: AdminB2bLeadRow["stage"];
      source?: AdminB2bLeadRow["source"];
      limit?: number;
      cursor?: string;
    } = {},
  ) {
    const params = new URLSearchParams();
    appendParam(params, "q", options.q);
    appendParam(params, "stage", options.stage);
    appendParam(params, "source", options.source);
    appendParam(params, "limit", options.limit);
    appendParam(params, "cursor", options.cursor);
    return this.request<{
      leads: AdminB2bLeadRow[];
      total: number;
      stageSummary: Array<{ stage: AdminB2bLeadRow["stage"]; count: number }>;
      limit: number;
      nextCursor: string | null;
    }>(`/api/admin/b2b/leads${querySuffix(params)}`);
  }

  listSalonCustomers(
    options: {
      q?: string;
      source?: "manual" | "linked_member";
      aftercareStatus?: "pending" | "overdue";
      limit?: number;
      cursor?: string;
    } = {},
  ) {
    const params = new URLSearchParams();
    appendParam(params, "q", options.q);
    appendParam(params, "source", options.source);
    appendParam(params, "aftercareStatus", options.aftercareStatus);
    appendParam(params, "limit", options.limit);
    appendParam(params, "cursor", options.cursor);
    return this.request<{
      customers: SalonCustomer[];
      limit: number;
      total: number;
      nextCursor: string | null;
      summary: {
        totalCustomers: number;
        linkedMembers: number;
        pendingAftercare: number;
        dueToday: number;
      };
      pendingAftercare: SalonAftercareTask[];
    }>(`/api/salon/customers${querySuffix(params)}`);
  }

  listSalonMatchCandidates(
    options: {
      q?: string;
      status?: "pending" | "linked" | "all";
      limit?: number;
      cursor?: string;
    } = {},
  ) {
    const params = new URLSearchParams();
    appendParam(params, "q", options.q);
    appendParam(params, "status", options.status);
    appendParam(params, "limit", options.limit);
    appendParam(params, "cursor", options.cursor);
    return this.request<{
      candidates: SalonMatchCandidate[];
      limit: number;
      nextCursor: string | null;
    }>(`/api/salon/matches${querySuffix(params)}`);
  }

  linkSalonMatchCandidate(requestId: string) {
    return this.request<{
      customer: SalonCustomer;
      match: SalonMatchCandidate;
    }>(`/api/salon/matches/${encodeURIComponent(requestId)}/link`, {
      method: "POST",
    });
  }

  getSalonCustomer(customerId: string) {
    return this.request<SalonCustomerDetailResponse>(
      `/api/salon/customers/${encodeURIComponent(customerId)}`,
    );
  }

  getSalonMatchInvite(code: string) {
    return this.request<SalonMatchInviteResponse>(
      `/api/salon/match/${encodeURIComponent(code)}`,
      { auth: false },
    );
  }

  acceptSalonMatchInvite(
    code: string,
    consent: SalonConnectionConsentAcceptance,
  ) {
    return this.request<{ match: unknown; status: string }>(
      `/api/salon/match/${encodeURIComponent(code)}`,
      {
        method: "POST",
        body: JSON.stringify(consent),
      },
    );
  }

  listSalonConnections() {
    return this.request<{ connections: SalonMemberConnection[] }>(
      "/api/salon/connections",
    );
  }

  revokeSalonConnection(requestId: string, reason = "user_requested") {
    return this.request<{ connection: SalonConnection }>(
      `/api/salon/matches/${encodeURIComponent(requestId)}`,
      {
        method: "DELETE",
        body: JSON.stringify({ reason }),
      },
    );
  }

  saveAccountSetup(input: {
    displayName: string;
    styleTarget: MemberStyleTarget;
    preferredStyleTone: MemberStyleTone;
  }) {
    return this.updateMemberProfile(input);
  }

  createRecommendations(referenceImageDataUrl: string) {
    return this.request<{
      generationId: string;
      analysis: RecommendationSet["analysis"];
      recommendations: GeneratedVariant[];
      catalogCycleId: string | null;
      creditsRequired: number;
      model: string;
      promptVersion: string;
      styleTarget: MemberStyleTarget;
      backgroundStarted: boolean;
    }>("/api/prompts/generate", {
      method: "POST",
      body: JSON.stringify({ referenceImageDataUrl }),
    });
  }

  getMemberProfile() {
    return this.request<{
      profile: {
        displayName: string;
        styleTarget: MemberStyleTarget | null;
        preferredStyleTone: MemberStyleTone;
      };
      accountSetupComplete: boolean;
    }>("/api/member-profile");
  }

  updateMemberProfile(input: {
    displayName: string;
    styleTarget: MemberStyleTarget;
    preferredStyleTone: MemberStyleTone;
  }) {
    return this.request<{
      profile: {
        displayName: string;
        styleTarget: MemberStyleTarget;
        preferredStyleTone: MemberStyleTone;
      };
      accountSetupComplete: boolean;
    }>("/api/member-profile", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  runGeneration(input: {
    generationId: string;
    prompt: string;
    promptArtifactToken: string;
    imageDataUrl: string;
    variantIndex: number;
    variantId: string;
    catalogItemId?: string | null;
  }) {
    return this.request<{
      id: string;
      variantId: string;
      variantIndex: number;
      catalogItemId: string | null;
      catalogCycleId: string | null;
      outputUrl: string | null;
      evaluation: unknown | null;
      generatedImagePath: string | null;
      chargedCredits: number;
      creditReceipt?: GenerationCreditReceipt | null;
    }>("/api/generations/run", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  translateResultCopy(texts: string[]) {
    return this.request<{ translations: string[] }>(
      "/api/result-translations",
      {
        method: "POST",
        body: JSON.stringify({ texts }),
      },
    );
  }

  prepareGenerationDraft(input: {
    clientRequestId: string;
    referenceImageDataUrl: string;
  }) {
    return this.request<GenerationDraftResponse>("/api/generations/drafts", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  retryGenerationVariant(input: {
    generationId: string;
    variantId: string;
    variantIndex: number;
    catalogItemId?: string | null;
  }) {
    return this.request<{
      id: string;
      variantId: string;
      variantIndex: number;
      outputUrl: string | null;
      generatedImagePath: string | null;
      evaluation: unknown | null;
      chargedCredits: number;
      creditReceipt?: GenerationCreditReceipt | null;
    }>("/api/generations/run", {
      method: "POST",
      body: JSON.stringify({ ...input, reuseStoredOriginal: true }),
    });
  }

  createPaidActionQuote(input: PaidActionQuoteRequest) {
    return this.request<PaidActionQuoteResponse>("/api/paid-actions/quote", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  acceptGenerationDraft(
    draftId: string,
    quoteId?: string,
    consultationId?: string,
    hairProfile?: CurrentHairProfileInput | null,
  ) {
    return this.request<GenerationAcceptanceResponse>(
      "/api/generations/accept",
      {
        method: "POST",
        body: JSON.stringify({
          draftId,
          ...(quoteId ? { quoteId } : {}),
          ...(consultationId ? { consultationId } : {}),
          ...(hairProfile ? { hairProfile } : {}),
        }),
      },
    );
  }

  getV2Catalog() {
    return this.request<OfferCatalogV2>("/api/v2/catalog");
  }

  quoteV2Entitlement(offeringKey: string) {
    return this.request<EntitlementDecisionV2>("/api/v2/entitlements/quote", {
      method: "POST",
      body: JSON.stringify({ offeringKey }),
    });
  }

  createV2Consultation(input: {
    sessionKind?: ConsultationKindV2;
    idempotencyKey: string;
    preferences?: Record<string, unknown>;
    planSnapshot?: Record<string, unknown>;
  }) {
    return this.request<{ consultation: ConsultationSessionV2 }>(
      "/api/v2/consultations",
      {
        method: "POST",
        headers: { "Idempotency-Key": input.idempotencyKey },
        body: JSON.stringify(input),
      },
    );
  }

  getV2Consultation(consultationId: string) {
    return this.request<{ consultation: ConsultationSessionV2 }>(
      `/api/v2/consultations/${encodeURIComponent(consultationId)}`,
    );
  }

  getPersonalColorProfileV2(consultationId: string) {
    return this.request<{
      profile: PersonalColorProfileV2;
      drapeEnabled: boolean;
    }>(
      `/api/v2/consultations/${encodeURIComponent(consultationId)}/personal-color/profile`,
    );
  }

  startPersonalColorDrapeV2(consultationId: string) {
    return this.request<{
      session: PersonalColorDrapeSessionV2;
      nextPair: PersonalColorDrapePairV2 | null;
    }>(
      `/api/consultations/${encodeURIComponent(consultationId)}/personal-color/drapes`,
      { method: "POST" },
    );
  }

  answerPersonalColorDrapeV2(input: {
    consultationId: string;
    drapeId: string;
    expectedRevision: number;
    pairId: string;
    response: PersonalColorDrapeResponseV2;
    preference?: PersonalColorDrapePreferenceV2;
  }) {
    return this.request<{
      session: PersonalColorDrapeSessionV2;
      nextPair: PersonalColorDrapePairV2 | null;
    }>(
      `/api/consultations/${encodeURIComponent(input.consultationId)}/personal-color/drapes/${encodeURIComponent(input.drapeId)}/responses`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedRevision: input.expectedRevision,
          pairId: input.pairId,
          response: input.response,
          preference: input.preference ?? null,
        }),
      },
    );
  }

  completePersonalColorDrapeV2(input: {
    consultationId: string;
    drapeId: string;
    expectedRevision: number;
    abandon: boolean;
  }) {
    return this.request<{
      session: PersonalColorDrapeSessionV2;
      profile: PersonalColorProfileV2 | null;
    }>(
      `/api/consultations/${encodeURIComponent(input.consultationId)}/personal-color/drapes/${encodeURIComponent(input.drapeId)}/complete`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedRevision: input.expectedRevision,
          abandon: input.abandon,
        }),
      },
    );
  }

  getPersonalColorTrainingConsent(consultationId: string) {
    return this.request<{
      consentVersion: string;
      granted: boolean;
      lastActionAt: string | null;
      productUseIndependent: true;
      sourceAssetsEnrolled: false;
    }>(
      `/api/consultations/${encodeURIComponent(consultationId)}/personal-color/training-consent`,
    );
  }

  setPersonalColorTrainingConsent(input: {
    consultationId: string;
    granted: boolean;
    idempotencyKey: string;
  }) {
    return this.request<{
      consentVersion: string;
      granted: boolean;
      lastActionAt: string | null;
      productUseIndependent: true;
      sourceAssetsEnrolled: false;
    }>(
      `/api/consultations/${encodeURIComponent(input.consultationId)}/personal-color/training-consent`,
      {
        method: input.granted ? "PUT" : "DELETE",
        body: JSON.stringify({
          ...(input.granted ? { accepted: true } : {}),
          consentVersion: "personal-color-training-v1",
          idempotencyKey: input.idempotencyKey,
        }),
      },
    );
  }

  getMakeupDirection(consultationId: string) {
    return this.request<{
      snapshot: MakeupDirectionSnapshot | null;
      revision: number | null;
      sourceFingerprint: string | null;
      staleSourceReasons: MakeupSourceStaleReason[];
      defaultContext: MakeupContextProfile;
      semanticMap: CapabilityResult<MakeupSemanticProjectionV3> | null;
      semanticEnabled: boolean;
      denseAtlasEnabled: boolean;
      simulationEnabled: boolean;
      simulation: {
        run: MakeupSimulationRunV1 | null;
        outputs: MakeupSimulationOutputV1[];
        selection: MakeupSimulationSelectionSnapshotV1 | null;
        workspaceState: string;
      };
      artifacts: {
        routine: MakeupRoutine | null;
        brief: MakeupArtistBrief | null;
        share: unknown | null;
      };
    }>(`/api/consultations/${encodeURIComponent(consultationId)}/makeup`);
  }

  getHairProfile(consultationId: string) {
    return this.request<{
      run: HairTraitAnalysisRunV1 | null;
      profile: HairProfileV2 | null;
      questions: DiagnosticQuestionInstanceV1[];
    }>(`/api/consultations/${encodeURIComponent(consultationId)}/hair-profile`);
  }

  answerHairProfileQuestion(input: {
    consultationId: string;
    questionId: string;
    expectedRevision: number;
    value: unknown;
    state?: "answered" | "unknown" | "skipped" | "salon_confirmation";
  }) {
    return this.request<{
      run: HairTraitAnalysisRunV1 | null;
      profile: HairProfileV2 | null;
      questions: DiagnosticQuestionInstanceV1[];
    }>(
      `/api/consultations/${encodeURIComponent(input.consultationId)}/hair-profile`,
      {
        method: "PATCH",
        body: JSON.stringify({
          questionId: input.questionId,
          expectedRevision: input.expectedRevision,
          value: input.value,
          state: input.state,
        }),
      },
    );
  }

  saveMakeupContext(consultationId: string, context: MakeupContextProfile) {
    return this.request<{
      snapshot: MakeupDirectionSnapshot;
      revision: number;
    }>(
      `/api/consultations/${encodeURIComponent(consultationId)}/makeup/context`,
      { method: "PUT", body: JSON.stringify(context) },
    );
  }

  buildMakeupDirection(consultationId: string, expectedRevision: number) {
    return this.request<{
      snapshot: MakeupDirectionSnapshot;
      revision: number;
      sourceFingerprint: string;
      semanticMap: CapabilityResult<MakeupSemanticProjectionV3> | null;
      semanticEnabled: boolean;
      denseAtlasEnabled: boolean;
    }>(
      `/api/consultations/${encodeURIComponent(consultationId)}/makeup/build`,
      { method: "POST", body: JSON.stringify({ expectedRevision }) },
    );
  }

  dispatchMakeupSemanticMap(consultationId: string) {
    return this.request<{
      semanticMap: CapabilityResult<MakeupSemanticProjectionV3>;
    }>(
      `/api/consultations/${encodeURIComponent(consultationId)}/makeup/semantic-map`,
      { method: "POST" },
    );
  }

  retryMakeupSemanticMap(consultationId: string) {
    return this.request<{
      semanticMap: CapabilityResult<MakeupSemanticProjectionV3>;
    }>(
      `/api/consultations/${encodeURIComponent(consultationId)}/makeup/semantic-map/retry`,
      { method: "POST" },
    );
  }

  patchMakeupModule(input: {
    consultationId: string;
    snapshotId: string;
    module: MakeupModule;
    patch: MakeupModulePatch;
  }) {
    return this.request<{
      snapshot: MakeupDirectionSnapshot;
      revision: number;
    }>(
      `/api/consultations/${encodeURIComponent(input.consultationId)}/makeup/modules/${encodeURIComponent(input.module)}`,
      {
        method: "PUT",
        body: JSON.stringify({ ...input.patch, snapshotId: input.snapshotId }),
      },
    );
  }

  confirmMakeupDirection(
    consultationId: string,
    snapshotId: string,
    expectedRevision: number,
  ) {
    return this.request<{
      snapshot: MakeupDirectionSnapshot;
      revision: number;
      artifacts: { routine: MakeupRoutine; brief: MakeupArtistBrief };
    }>(
      `/api/consultations/${encodeURIComponent(consultationId)}/makeup/confirm`,
      {
        method: "POST",
        body: JSON.stringify({ snapshotId, expectedRevision }),
      },
    );
  }

  analyzeV2ConsultationPhoto(input: {
    consultationId: string;
    draftId: string;
    expectedVersion: number;
    photo: PhotoSnapshot;
    faceEvidence?: PhotoFaceDetectionEvidence;
  }) {
    return this.request<{
      accepted?: boolean;
      requiresRetry: boolean;
      evidenceId?: string;
      quality?: Array<{ id: string; status: string; message: string }>;
      preflightMessage?: string;
    }>(
      `/api/consultations/${encodeURIComponent(input.consultationId)}/photo-analysis`,
      {
        method: "POST",
        body: JSON.stringify({
          draftId: input.draftId,
          expectedVersion: input.expectedVersion,
          photo: input.photo,
          faceEvidence: input.faceEvidence ?? {
            status: "unsupported",
            count: null,
            box: null,
          },
        }),
      },
    );
  }

  getV2AnalysisEvidence(consultationId: string) {
    return this.request<{
      evidence: AnalysisEvidenceV2;
      sourceImageUrl: string | null;
      overlayEnabled: boolean;
    }>(`/api/v2/consultations/${encodeURIComponent(consultationId)}/evidence`);
  }

  correctV2AnalysisEvidence(input: {
    consultationId: string;
    expectedRevision: number;
    targetType: EvidenceCorrectionTargetV2;
    targetId: string;
    pointIndex: number;
    adjustedPoint: NormalizedPointV2;
  }) {
    return this.request<{ evidence: AnalysisEvidenceV2 }>(
      `/api/v2/consultations/${encodeURIComponent(input.consultationId)}/evidence`,
      {
        method: "PATCH",
        body: JSON.stringify({
          expectedRevision: input.expectedRevision,
          targetType: input.targetType,
          targetId: input.targetId,
          pointIndex: input.pointIndex,
          adjustedPoint: input.adjustedPoint,
        }),
      },
    );
  }

  attachV2ConsultationPhoto(
    consultationId: string,
    generationId: string,
    expectedVersion: number,
  ) {
    return this.request<{ consultation: ConsultationSessionV2 }>(
      `/api/v2/consultations/${encodeURIComponent(consultationId)}/photo`,
      {
        method: "POST",
        body: JSON.stringify({ generationId, expectedVersion }),
      },
    );
  }

  getV2PreviewBoard(consultationId: string) {
    return this.request<{
      board: PreviewBoardV2 | null;
      state?: string;
      generationId?: string;
    }>(
      `/api/v2/consultations/${encodeURIComponent(consultationId)}/preview-board`,
    );
  }

  getV2HairRecommendation(consultationId: string) {
    return this.request<{ decision: HairRecommendationDecisionV1; board: PreviewBoardV2 | null }>(
      `/api/v2/consultations/${encodeURIComponent(consultationId)}/hair-recommendation`,
    );
  }

  evaluateV2HairRecommendation(consultationId: string) {
    return this.request<{ decision: HairRecommendationDecisionV1 }>(
      `/api/v2/consultations/${encodeURIComponent(consultationId)}/hair-recommendation/evaluate`,
      { method: "POST" },
    );
  }

  prepareV2HairAdjustmentGeneration(consultationId: string) {
    return this.request<{ draftId: string; recommendationRevision: number; replay: boolean }>(
      `/api/v2/consultations/${encodeURIComponent(consultationId)}/hair-recommendation/start`,
      { method: "POST" },
    );
  }

  answerV2HairRecommendationClarification(consultationId: string, expectedRevision: number, answer: string) {
    return this.request<{ decision: HairRecommendationDecisionV1 }>(
      `/api/v2/consultations/${encodeURIComponent(consultationId)}/hair-recommendation/clarification`,
      { method: "POST", body: JSON.stringify({ expectedRevision, answer }) },
    );
  }

  adjustV2HairRecommendation(consultationId: string, expectedRevision: number, aspects: Array<{ aspect: HairAdjustmentAspect; value: string }>, idempotencyKey: string) {
    return this.request<{ decision: HairRecommendationDecisionV1; recommendedRoute: string }>(
      `/api/v2/consultations/${encodeURIComponent(consultationId)}/hair-recommendation/adjust`,
      { method: "POST", body: JSON.stringify({ expectedRevision, aspects, idempotencyKey }) },
    );
  }

  confirmV2HairRecommendation(consultationId: string, expectedRevision: number) {
    return this.request<{ decision: HairRecommendationDecisionV1; recommendedRoute: string }>(
      `/api/v2/consultations/${encodeURIComponent(consultationId)}/hair-recommendation/confirm`,
      { method: "POST", body: JSON.stringify({ expectedRevision }) },
    );
  }

  saveV2Shortlist(
    consultationId: string,
    previewVariantIds: string[],
    expectedVersion: number,
  ) {
    return this.request<{
      shortlist: {
        consultationId: string;
        boardId: string;
        previewVariantIds: string[];
      };
    }>(
      `/api/v2/consultations/${encodeURIComponent(consultationId)}/shortlist`,
      {
        method: "POST",
        body: JSON.stringify({ previewVariantIds, expectedVersion }),
      },
    );
  }

  getV2Shortlist(consultationId: string) {
    return this.request<{
      shortlist: {
        consultationId: string;
        boardId: string;
        previewVariantIds: string[];
        version: number;
        updatedAt: string | null;
      };
    }>(`/api/v2/consultations/${encodeURIComponent(consultationId)}/shortlist`);
  }

  selectV2Style(
    consultationId: string,
    previewVariantId: string,
    expectedVersion: number,
  ) {
    return this.request<{ selection: StyleSelectionSnapshotV2 }>(
      `/api/v2/consultations/${encodeURIComponent(consultationId)}/selection`,
      {
        method: "POST",
        body: JSON.stringify({ previewVariantId, expectedVersion }),
      },
    );
  }

  getV2Selection(consultationId: string) {
    return this.request<{ selection: StyleSelectionSnapshotV2 }>(
      `/api/v2/consultations/${encodeURIComponent(consultationId)}/selection`,
    );
  }

  confirmV2Style(
    consultationId: string,
    snapshotId: string,
    expectedVersion: number,
  ) {
    return this.request<Record<string, unknown>>(
      `/api/v2/consultations/${encodeURIComponent(consultationId)}/confirm`,
      { method: "POST", body: JSON.stringify({ snapshotId, expectedVersion }) },
    );
  }

  createV2SalonBrief(
    consultationId: string,
    idempotencyKey: string,
    brief?: {
      audience: "customer" | "designer";
      summary: string;
      cut: Record<string, unknown>;
      volumeTexture: Record<string, unknown>;
      color: Record<string, unknown> | null;
      styling: string[];
      cautions: string[];
    },
  ) {
    return this.request<{ brief: SalonBriefV2 }>(
      `/api/v2/consultations/${encodeURIComponent(consultationId)}/salon-brief`,
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ brief }),
      },
    );
  }

  createV2Aftercare(input: {
    consultationId: string;
    idempotencyKey: string;
    services: string[];
    serviceDate: string;
    designerNotes?: string;
    today: string[];
    checkpoints: AftercareProgramV2["checkpoints"];
    concerns: string[];
    satisfaction: number | null;
  }) {
    return this.request<{ program: AftercareProgramV2 }>(
      `/api/v2/consultations/${encodeURIComponent(input.consultationId)}/aftercare`,
      {
        method: "POST",
        headers: { "Idempotency-Key": input.idempotencyKey },
        body: JSON.stringify(input),
      },
    );
  }

  getV2Aftercare(consultationId: string) {
    return this.request<{
      program: AftercareProgramV2 | null;
      actualService: {
        id: string;
        services: string[];
        serviceDate: string;
        designerNotes: string;
        confirmedAt: string;
      } | null;
    }>(`/api/v2/consultations/${encodeURIComponent(consultationId)}/aftercare`);
  }

  updateV2Aftercare(input: {
    consultationId: string;
    actualServiceId: string;
    expectedVersion: number;
    idempotencyKey: string;
    today: string[];
    checkpoints: AftercareProgramV2["checkpoints"];
    concerns: string[];
    satisfaction: number | null;
  }) {
    return this.request<{ program: AftercareProgramV2 }>(
      `/api/v2/consultations/${encodeURIComponent(input.consultationId)}/aftercare`,
      {
        method: "PATCH",
        headers: { "Idempotency-Key": input.idempotencyKey },
        body: JSON.stringify(input),
      },
    );
  }

  createV2FashionPreviews(input: {
    consultationId: string;
    idempotencyKey: string;
    stylingSessionIds: string[];
    selectedStylingSessionId: string;
    personalColorEvidenceId?: string | null;
  }) {
    return this.request<{ previewSet: FashionPreviewSetV2 }>(
      `/api/v2/consultations/${encodeURIComponent(input.consultationId)}/fashion-previews`,
      {
        method: "POST",
        headers: { "Idempotency-Key": input.idempotencyKey },
        body: JSON.stringify(input),
      },
    );
  }

  getV2FashionPreviews(consultationId: string) {
    return this.request<{
      previews: FashionPreviewCandidateV2[];
      previewSet: FashionPreviewSetV2 | null;
    }>(
      `/api/v2/consultations/${encodeURIComponent(consultationId)}/fashion-previews`,
      { method: "GET" },
    );
  }

  getV2FashionBatch(consultationId: string) {
    return this.request<{
      batch: FashionPreviewBatch | null;
      stylingSessionIds: string[];
      adaptiveEnabled?: boolean;
    }>(
      `/api/v2/consultations/${encodeURIComponent(consultationId)}/fashion-batch`,
    );
  }

  getV2ConsultationReport(consultationId: string) {
    return this.request<{
      report: ConsultationReportViewModelV2;
      provenance: ConsultationReportViewModelV2["provenance"];
    }>(
      `/api/v2/consultations/${encodeURIComponent(consultationId)}/report?surface=native`,
    );
  }

  prepareV2FashionBatch(input: {
    consultationId: string;
    idempotencyKey: string;
    direction: FashionDirectionSnapshot;
  }) {
    return this.request<{
      batch: FashionPreviewBatch;
      stylingSessionIds: string[];
    }>(
      `/api/v2/consultations/${encodeURIComponent(input.consultationId)}/fashion-batch`,
      {
        method: "POST",
        headers: { "Idempotency-Key": input.idempotencyKey },
        body: JSON.stringify({ direction: input.direction }),
      },
    );
  }

  reconcileV2FashionBatch(consultationId: string, batchId: string) {
    return this.request<{
      batch: FashionPreviewBatch;
      stylingSessionIds: string[];
    }>(
      `/api/v2/consultations/${encodeURIComponent(consultationId)}/fashion-batch`,
      {
        method: "PATCH",
        body: JSON.stringify({ action: "reconcile", batchId }),
      },
    );
  }

  dispatchV2FashionBatch(consultationId: string, batchId: string) {
    return this.request<{
      batch: FashionPreviewBatch;
      stylingSessionIds: string[];
    }>(
      `/api/v2/consultations/${encodeURIComponent(consultationId)}/fashion-batch`,
      {
        method: "PATCH",
        body: JSON.stringify({ action: "dispatch", batchId }),
      },
    );
  }

  expandV2FashionBatch(input: {
    consultationId: string;
    batchId: string;
    expectedRequestedCount: 3 | 6;
    targetRequestedCount: 6 | 9;
    idempotencyKey: string;
  }) {
    return this.request<{ batch: FashionPreviewBatch; stylingSessionIds: string[] }>(
      `/api/v2/consultations/${encodeURIComponent(input.consultationId)}/fashion-batch/expand`,
      {
        method: "POST",
        headers: { "Idempotency-Key": input.idempotencyKey },
        body: JSON.stringify({ batchId: input.batchId, expectedRequestedCount: input.expectedRequestedCount, targetRequestedCount: input.targetRequestedCount }),
      },
    );
  }

  retryV2FashionBatchSlots(input: { consultationId: string; batchId: string; slotIds: string[] }) {
    return this.request<{ batch: FashionPreviewBatch; stylingSessionIds: string[] }>(
      `/api/v2/consultations/${encodeURIComponent(input.consultationId)}/fashion-batch/retry`,
      { method: "POST", body: JSON.stringify({ batchId: input.batchId, slotIds: input.slotIds }) },
    );
  }

  selectV2FashionBatchPreview(input: {
    consultationId: string;
    batchId: string;
    previewId: string;
    decision: "accept_recommended" | "customer_override";
    expectedRevision: number;
  }) {
    return this.request<{ batch: FashionPreviewBatch; stylingSessionIds: string[] }>(
      `/api/v2/consultations/${encodeURIComponent(input.consultationId)}/fashion-batch/select`,
      { method: "POST", body: JSON.stringify(input) },
    );
  }

  startGeneration(generationId: string) {
    return this.request<GenerationStartResponse>("/api/generations/start", {
      method: "POST",
      body: JSON.stringify({ generationId }),
    });
  }

  getGenerationStatus(generationId: string) {
    return this.request<GenerationStatusResponse>(
      `/api/generations/${encodeURIComponent(generationId)}/status`,
      { method: "GET" },
    );
  }

  getGeneration(id: string) {
    return this.request<GenerationDetailApiResponse>(
      `/api/generations/${encodeURIComponent(id)}`,
    );
  }

  abandonGenerationRetry(id: string) {
    return this.request<{
      ok: true;
      cleanup: {
        generationId: string;
        cleanupId: string | null;
        cleanupStatus: string;
      };
      originalRetention: GenerationOriginalRetentionState;
    }>(`/api/generations/${encodeURIComponent(id)}/abandon-retry`, {
      method: "POST",
    });
  }

  recordGenerationResultOpened(
    id: string,
    source: GenerationFunnelClientSource,
  ) {
    return this.request<{ accepted: true; event: "result_opened" }>(
      `/api/generations/${encodeURIComponent(id)}/events`,
      {
        method: "POST",
        body: JSON.stringify({ event: "result_opened", source }),
      },
    );
  }

  patchSelectedVariant(generationId: string, selectedVariantId: string) {
    return this.request<GenerationSelectionApiResponse>(
      `/api/generations/${encodeURIComponent(generationId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ selectedVariantId }),
      },
    );
  }

  getStyleProfile() {
    return this.request<StylingProfileApiSuccess>("/api/style-profile");
  }

  getFashionPersonalizationPolicy() {
    return this.request<{ policy: UserFashionPersonalizationPolicyV1; coverage: FashionPolicyCoverageV1; learningResetAt: string | null }>(
      "/api/v2/me/onboarding/fashion-personalization",
    );
  }

  patchFashionPersonalizationPolicy(expectedRevision: number, patch: Record<string, unknown>) {
    return this.request<{ policy: UserFashionPersonalizationPolicyV1; coverage: FashionPolicyCoverageV1; learningResetAt: string | null }>(
      "/api/v2/me/onboarding/fashion-personalization",
      { method: "PATCH", body: JSON.stringify({ expectedRevision, patch }) },
    );
  }

  confirmFashionPersonalizationPolicy(expectedRevision: number) {
    return this.request<{ policy: UserFashionPersonalizationPolicyV1; coverage: FashionPolicyCoverageV1; learningResetAt: string | null }>(
      "/api/v2/me/onboarding/fashion-personalization/confirm",
      { method: "POST", body: JSON.stringify({ expectedRevision }) },
    );
  }

  resetFashionPersonalizationLearning() {
    return this.request<{ policy: UserFashionPersonalizationPolicyV1; coverage: FashionPolicyCoverageV1; learningResetAt: string | null }>(
      "/api/v2/me/onboarding/fashion-personalization/reset-learning",
      { method: "POST" },
    );
  }

  getConsultationFashionContext(consultationId: string) {
    return this.request<{ context: ConsultationFashionContextV1 }>(
      `/api/v2/consultations/${encodeURIComponent(consultationId)}/fashion/context`,
    );
  }

  patchConsultationFashionContext(consultationId: string, expectedRevision: number, patch: Record<string, unknown>) {
    return this.request<{ context: ConsultationFashionContextV1 }>(
      `/api/v2/consultations/${encodeURIComponent(consultationId)}/fashion/context`,
      { method: "PATCH", body: JSON.stringify({ expectedRevision, patch }) },
    );
  }

  confirmConsultationFashionContext(consultationId: string, expectedRevision: number) {
    return this.request<{ context: ConsultationFashionContextV1 }>(
      `/api/v2/consultations/${encodeURIComponent(consultationId)}/fashion/context/confirm`,
      { method: "POST", body: JSON.stringify({ expectedRevision }) },
    );
  }

  createFashionPersonalizationSnapshot(consultationId: string) {
    return this.request<{ snapshotId: string; snapshot: FashionPersonalizationSnapshotV1; rankedOffers: FashionRankedOfferV2[] }>(
      `/api/v2/consultations/${encodeURIComponent(consultationId)}/fashion/personalization-snapshot`,
      { method: "POST" },
    );
  }

  analyzePersonalColor(referenceImageDataUrl: string) {
    return this.request<{ personalColor: PersonalColorResult }>(
      "/api/personal-color/analyze",
      {
        method: "POST",
        body: JSON.stringify({ referenceImageDataUrl }),
      },
    );
  }

  updateStyleProfile(input: {
    heightCm: number | string | null;
    bodyShape: StyleProfile["bodyShape"];
    topSize: string | null;
    bottomSize: string | null;
    fitPreference: StyleProfile["fitPreference"];
    colorPreference?: string | null;
    exposurePreference: StyleProfile["exposurePreference"];
    avoidItems?: string[] | string | null;
  }) {
    return this.request<{ profile: StyleProfile }>("/api/style-profile", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  uploadBodyPhoto(file: { uri: string; name: string; type: string }) {
    const formData = new FormData();
    formData.append("file", file as unknown as Blob);
    return this.request<{ profile: StyleProfile }>(
      "/api/style-profile/body-photo",
      {
        method: "POST",
        body: formData,
      },
    );
  }

  deleteBodyPhoto() {
    return this.request<{ profile: StyleProfile }>(
      "/api/style-profile/body-photo",
      {
        method: "DELETE",
      },
    );
  }

  getStylingHairstyles() {
    return this.request<StylingHairstyleListApiSuccess>(
      "/api/styling/hairstyles",
    );
  }

  recommendStyling(input: {
    generationId: string;
    selectedVariantId: string;
    genre: FashionGenre;
  }) {
    return this.request<StylingRecommendApiSuccess>("/api/styling/recommend", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  generateStyling(sessionId: string, quoteId?: string) {
    return this.request<StylingGenerateApiResponse>("/api/styling/generate", {
      method: "POST",
      body: JSON.stringify({ sessionId, ...(quoteId ? { quoteId } : {}) }),
    });
  }

  getStylingSession(sessionId: string) {
    return this.request<StylingSessionApiSuccess>(
      `/api/styling/${encodeURIComponent(sessionId)}`,
    );
  }

  createHairRecord(input: {
    generationId: string;
    selectedVariantId: string;
    serviceType: ServiceType;
    serviceDate: string;
    quoteId: string;
  }) {
    return this.request<{
      hairRecordId: string;
      aftercareGuideId: string | null;
      styleName: string;
      serviceType: ServiceType;
      serviceDate: string;
      nextVisitTargetDays: number;
      careScheduledCount: number;
      redirectTo: string;
      alreadyConfirmed?: boolean;
      selectionLocked?: boolean;
      chargedCredits: number;
      firstAftercareProgramFreeUsed: boolean;
      aftercareProgramCreditCost: number;
      creditReceipt: PaidActionExecutionReceipt | null;
    }>("/api/hair-records", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  getAftercareRecords() {
    return this.request<MobileAftercareListResponse>("/api/mobile/aftercare");
  }

  getAftercareGuide(hairRecordId: string) {
    return this.request<MobileAftercareGuideResponse>(
      `/api/mobile/aftercare/${encodeURIComponent(hairRecordId)}`,
    );
  }

  prepareMobilePayment(input: { plan: MobilePaymentPlan; appScheme: string }) {
    return this.request<MobilePaymentPrepareResponse>(
      "/api/mobile/payments/prepare",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  completeMobilePayment(paymentId: string) {
    return this.request<MobilePaymentCompleteResponse>(
      "/api/mobile/payments/complete",
      {
        method: "POST",
        body: JSON.stringify({ paymentId }),
      },
    );
  }

  getGooglePlayCatalog() {
    return this.request<MobileGooglePlayCatalogResponse>(
      "/api/mobile/google-play/catalog",
    );
  }

  createGooglePlayPurchaseIntent(input: MobileGooglePlayPurchaseIntentRequest) {
    return this.request<MobileGooglePlayPurchaseIntentResponse>(
      "/api/mobile/google-play/intents",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  verifyGooglePlayPurchase(input: MobileGooglePlayPurchaseVerificationRequest) {
    return this.request<MobileGooglePlayPurchaseVerificationResponse>(
      "/api/mobile/google-play/purchases/verify",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }
}
