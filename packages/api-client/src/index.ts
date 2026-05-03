import type {
  GeneratedVariant,
  HairstyleGenerationGroup,
  MobileAftercareGuideResponse,
  MobileAftercareListResponse,
  MobileBootstrap,
  MobileDashboard,
  MobilePaymentCompleteResponse,
  MobilePaymentPlan,
  MobilePaymentPrepareResponse,
  RecommendationSet,
  ServiceType,
  StyleProfile,
  FashionGenre,
  FashionRecommendation,
  StylingSessionDetails,
} from "@hairfit/shared";

export interface HairfitApiClientOptions {
  baseUrl: string;
  getAuthToken?: () => Promise<string | null> | string | null;
  fetchImpl?: typeof fetch;
}

export interface ApiRequestOptions extends RequestInit {
  auth?: boolean;
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

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      credentials: "include",
      ...options,
      headers,
    });
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

  getMobileDashboard(service: "customer" | "salon" | "admin") {
    return this.request<MobileDashboard>(`/api/mobile/dashboard?service=${encodeURIComponent(service)}`);
  }

  submitOnboarding(input: {
    displayName: string;
    styleTarget: "male" | "female" | "neutral";
    preferredStyleTone: "natural" | "trendy" | "soft" | "bold";
  }) {
    return this.request<{
      onboardingComplete: true;
      accountType: "member";
      redirectTo: string;
    }>("/api/onboarding", {
      method: "POST",
      body: JSON.stringify({
        accountType: "member",
        displayName: input.displayName,
        styleTarget: input.styleTarget,
        preferredStyleTone: input.preferredStyleTone,
        returnUrl: "/mypage",
      }),
    });
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
    }>("/api/prompts/generate", {
      method: "POST",
      body: JSON.stringify({ referenceImageDataUrl }),
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
    }>("/api/generations/run", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  getGeneration(id: string) {
    return this.request<{
      id: string;
      status: string;
      recommendationSet: RecommendationSet | null;
      selectedVariant: unknown | null;
    }>(`/api/generations/${encodeURIComponent(id)}`);
  }

  patchSelectedVariant(generationId: string, selectedVariantId: string) {
    return this.request<{ ok: true; selectedVariantId: string }>(
      `/api/generations/${encodeURIComponent(generationId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ selectedVariantId }),
      },
    );
  }

  getStyleProfile() {
    return this.request<{ profile: StyleProfile }>("/api/style-profile");
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

  getStylingHairstyles() {
    return this.request<{ generations: HairstyleGenerationGroup[] }>("/api/styling/hairstyles");
  }

  recommendStyling(input: {
    generationId: string;
    selectedVariantId: string;
    genre: FashionGenre;
  }) {
    return this.request<{
      sessionId: string | null;
      status: string;
      recommendation: FashionRecommendation;
      profile: StyleProfile;
      selectedVariant: GeneratedVariant;
    }>("/api/styling/recommend", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  generateStyling(sessionId: string) {
    return this.request<{
      sessionId: string;
      imageUrl?: string | null;
      imagePath?: string | null;
      chargedCredits?: number;
    }>("/api/styling/generate", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    });
  }

  getStylingSession(sessionId: string) {
    return this.request<{ session: StylingSessionDetails }>(
      `/api/styling/${encodeURIComponent(sessionId)}`,
    );
  }

  createHairRecord(input: {
    generationId: string;
    selectedVariantId: string;
    serviceType: ServiceType;
    serviceDate: string;
  }) {
    return this.request<{
      hairRecordId: string;
      aftercareGuideId: string;
      styleName: string;
      serviceType: ServiceType;
      serviceDate: string;
      nextVisitTargetDays: number;
      careScheduledCount: number;
      redirectTo: string;
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
