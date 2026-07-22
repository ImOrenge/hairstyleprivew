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
  MobilePaymentCompleteResponse,
  MobilePaymentPlan,
  MobilePaymentPrepareResponse,
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
} from "@hairfit/shared";

export { LatestRequestGuard } from "./latest-request-guard";
export type { GenerationStatus };

export interface HairfitApiClientOptions {
  baseUrl: string;
  getAuthToken?: (options?: { skipCache?: boolean }) => Promise<string | null> | string | null;
  fetchImpl?: typeof fetch;
}

export interface ApiRequestOptions extends RequestInit {
  auth?: boolean;
}

export type GenerationStartResponse = GenerationStartApiResponse;
export type GenerationDraftResponse = GenerationDraftApiResponse;
export type GenerationAcceptanceResponse = GenerationAcceptanceApiResponse;
export type GenerationStatusResponse = GenerationStatusApiResponse;

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

function appendParam(params: URLSearchParams, key: string, value: string | number | null | undefined) {
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

    if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    if (shouldAttachAuth && this.getAuthToken) {
      const token = await this.getAuthToken();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    }

    const execute = () => this.fetchImpl(`${this.baseUrl}${path}`, {
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
        payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : `HairFit API request failed with ${response.status}`;
      throw new HairfitApiError(message, response.status, payload);
    }

    return payload as T;
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
    return this.request<MobilePushDeviceRegistrationResponse>("/api/mobile/push-devices", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  revokeMobilePushDevice(installationId: string, reason = "user_disabled") {
    return this.request<MobilePushDeviceRevocationResponse>("/api/mobile/push-devices", {
      method: "DELETE",
      body: JSON.stringify({ installationId, reason }),
    });
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

  getMobileDashboard(service: "customer" | "salon" | "admin", options: { range?: 7 | 30 | 90 } = {}) {
    const params = new URLSearchParams({ service });
    if (options.range) {
      params.set("range", String(options.range));
    }

    return this.request<MobileDashboard>(`/api/mobile/dashboard?${params.toString()}`);
  }

  listAdminMembers(options: { q?: string; accountType?: string; limit?: number; cursor?: string } = {}) {
    const params = new URLSearchParams();
    appendParam(params, "q", options.q);
    appendParam(params, "accountType", options.accountType);
    appendParam(params, "limit", options.limit);
    appendParam(params, "cursor", options.cursor);
    return this.request<{ members: AdminMemberListRow[]; total: number; limit: number; nextCursor: string | null }>(
      `/api/admin/members${querySuffix(params)}`,
    );
  }

  getAdminMember(userId: string) {
    return this.request<AdminMemberDetailResponse>(`/api/admin/members/${encodeURIComponent(userId)}`);
  }

  listAdminReviews(options: { q?: string; visibility?: "visible" | "hidden"; limit?: number; cursor?: string } = {}) {
    const params = new URLSearchParams();
    appendParam(params, "q", options.q);
    appendParam(params, "visibility", options.visibility);
    appendParam(params, "limit", options.limit);
    appendParam(params, "cursor", options.cursor);
    return this.request<{ reviews: AdminReviewRow[]; total: number; limit: number; nextCursor: string | null }>(
      `/api/admin/reviews${querySuffix(params)}`,
    );
  }

  createRefundQuote(input: RefundQuoteRequest) {
    return this.request<RefundQuoteResponse>("/api/payments/refund-quotes", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  submitRefundRequest(input: RefundRequestSubmission) {
    return this.request<RefundRequestResponse>("/api/payments/refund-requests", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  getRefundRequest(requestId: string) {
    return this.request<{ refundRequest: RefundRequestSummary }>(
      `/api/payments/refund-requests/${encodeURIComponent(requestId)}`,
    );
  }

  listAdminInboundEmails(options: { q?: string; status?: "new" | "read" | "archived"; mailbox?: "support" | "business" | "general"; limit?: number; cursor?: string } = {}) {
    const params = new URLSearchParams();
    appendParam(params, "q", options.q);
    appendParam(params, "status", options.status);
    appendParam(params, "mailbox", options.mailbox);
    appendParam(params, "limit", options.limit);
    appendParam(params, "cursor", options.cursor);
    return this.request<{
      emails: AdminInboundEmailRow[];
      total: number;
      statusSummary: Array<{ status: AdminInboundEmailRow["status"]; count: number }>;
      mailboxSummary: Array<{ mailbox: AdminInboundEmailRow["mailbox"]; count: number }>;
      limit: number;
      nextCursor: string | null;
    }>(`/api/admin/inbound-emails${querySuffix(params)}`);
  }

  listAdminB2bLeads(options: { q?: string; stage?: AdminB2bLeadRow["stage"]; source?: AdminB2bLeadRow["source"]; limit?: number; cursor?: string } = {}) {
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

  listSalonCustomers(options: { q?: string; source?: "manual" | "linked_member"; aftercareStatus?: "pending" | "overdue"; limit?: number; cursor?: string } = {}) {
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

  listSalonMatchCandidates(options: { q?: string; status?: "pending" | "linked" | "all"; limit?: number; cursor?: string } = {}) {
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
    return this.request<{ customer: SalonCustomer; match: SalonMatchCandidate }>(
      `/api/salon/matches/${encodeURIComponent(requestId)}/link`,
      { method: "POST" },
    );
  }

  getSalonCustomer(customerId: string) {
    return this.request<SalonCustomerDetailResponse>(`/api/salon/customers/${encodeURIComponent(customerId)}`);
  }

  getSalonMatchInvite(code: string) {
    return this.request<SalonMatchInviteResponse>(`/api/salon/match/${encodeURIComponent(code)}`, { auth: false });
  }

  acceptSalonMatchInvite(code: string, consent: SalonConnectionConsentAcceptance) {
    return this.request<{ match: unknown; status: string }>(`/api/salon/match/${encodeURIComponent(code)}`, {
      method: "POST",
      body: JSON.stringify(consent),
    });
  }

  listSalonConnections() {
    return this.request<{ connections: SalonMemberConnection[] }>("/api/salon/connections");
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
    return this.request<{ translations: string[] }>("/api/result-translations", {
      method: "POST",
      body: JSON.stringify({ texts }),
    });
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

  acceptGenerationDraft(draftId: string, quoteId?: string) {
    return this.request<GenerationAcceptanceResponse>("/api/generations/accept", {
      method: "POST",
      body: JSON.stringify({ draftId, ...(quoteId ? { quoteId } : {}) }),
    });
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
    return this.request<GenerationDetailApiResponse>(`/api/generations/${encodeURIComponent(id)}`);
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

  recordGenerationResultOpened(id: string, source: GenerationFunnelClientSource) {
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

  analyzePersonalColor(referenceImageDataUrl: string) {
    return this.request<{ personalColor: PersonalColorResult }>("/api/personal-color/analyze", {
      method: "POST",
      body: JSON.stringify({ referenceImageDataUrl }),
    });
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
    return this.request<{ profile: StyleProfile }>("/api/style-profile/body-photo", {
      method: "POST",
      body: formData,
    });
  }

  deleteBodyPhoto() {
    return this.request<{ profile: StyleProfile }>("/api/style-profile/body-photo", {
      method: "DELETE",
    });
  }

  getStylingHairstyles() {
    return this.request<StylingHairstyleListApiSuccess>("/api/styling/hairstyles");
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
    return this.request<MobilePaymentPrepareResponse>("/api/mobile/payments/prepare", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  completeMobilePayment(paymentId: string) {
    return this.request<MobilePaymentCompleteResponse>("/api/mobile/payments/complete", {
      method: "POST",
      body: JSON.stringify({ paymentId }),
    });
  }
}
