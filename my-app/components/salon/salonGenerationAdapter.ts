import type { PaidActionQuoteErrorCode } from "@hairfit/shared";
import type { GeneratedVariant, MemberStyleTarget } from "../../lib/recommendation-types";
import type {
  SalonCustomer,
  SalonServiceType,
} from "../../lib/salon-crm-types";

export interface SalonRecommendationApiResponse {
  generationId?: string;
  acceptedAt?: string;
  preparationStatus?: string;
  workflowDispatchStatus?: string;
  analysis?: unknown;
  recommendations?: Array<GeneratedVariant & { promptArtifactToken?: string }>;
  creditsRequired?: number;
  creditReceipt?: unknown;
  billingMode?: "reserved_v1" | "legacy_unmanaged";
  code?: PaidActionQuoteErrorCode;
  quote?: unknown;
  error?: string;
}

export interface SalonGenerationStatusResponse {
  status?: "queued" | "processing" | "completed" | "failed";
  terminal?: boolean;
  updatedAt?: string;
  acceptedAt?: string | null;
  preparationStatus?: "queued" | "preparing" | "retry" | "ready" | "failed";
  preparationError?: string | null;
  creditReceipt?: unknown;
  creditReceiptUnavailable?: boolean;
  variants?: {
    total: number;
    completed: number;
    failed: number;
  };
  error?: string;
}

export interface SalonGenerationDetailResponse {
  recommendationSet?: { variants?: GeneratedVariant[] } | null;
  creditReceipt?: unknown;
  creditReceiptUnavailable?: boolean;
  error?: string;
}

export interface SalonConfirmResponse {
  redirectTo?: string;
  error?: string;
}

export async function loadSalonCustomer(
  customerId: string,
  signal?: AbortSignal,
) {
  const response = await fetch(
    `/api/salon/customers/${encodeURIComponent(customerId)}`,
    { cache: "no-store", signal },
  );
  const data = (await response.json().catch(() => ({}))) as {
    customer?: SalonCustomer;
    error?: string;
  };

  if (!response.ok || !data.customer) {
    throw new Error(data.error || "고객 정보를 불러오지 못했습니다.");
  }

  return data.customer;
}

export async function requestSalonGenerationQuote(draftId: string) {
  const response = await fetch("/api/paid-actions/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "hair_generation",
      subjectId: draftId,
      billingScope: "salon",
    }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    quote?: unknown;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error || "살롱 계정의 최신 크레딧 견적을 불러오지 못했습니다.");
  }

  return data.quote;
}

export async function createSalonGenerationDraft(input: {
  clientRequestId: string;
  referenceImageDataUrl: string;
}) {
  const response = await fetch("/api/generations/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await response.json().catch(() => ({}))) as {
    draftId?: string;
    error?: string;
  };

  if (!response.ok || !data.draftId) {
    throw new Error(data.error || "고객 사진을 안전하게 업로드하지 못했습니다.");
  }

  return data.draftId;
}

export async function loadSalonGenerationStatus(generationId: string) {
  const response = await fetch(
    `/api/generations/${encodeURIComponent(generationId)}/status`,
    { cache: "no-store" },
  );
  const data = (await response.json().catch(() => ({}))) as SalonGenerationStatusResponse;

  if (!response.ok) {
    throw new Error(data.error || "살롱 헤어 생성 상태를 불러오지 못했습니다.");
  }

  return data;
}

export async function loadSalonGenerationDetail(generationId: string) {
  const response = await fetch(
    `/api/generations/${encodeURIComponent(generationId)}`,
    { cache: "no-store" },
  );
  const data = (await response.json().catch(() => ({}))) as SalonGenerationDetailResponse;

  if (!response.ok) {
    throw new Error(data.error || "살롱 헤어 추천 보드를 불러오지 못했습니다.");
  }

  return data;
}

export async function acceptSalonGeneration(input: {
  customerId: string;
  draftId: string;
  quoteId?: string;
  styleTarget: MemberStyleTarget;
  photoConsentConfirmed: boolean;
}) {
  const response = await fetch(
    `/api/salon/customers/${encodeURIComponent(input.customerId)}/workspace/recommendations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draftId: input.draftId,
        quoteId: input.quoteId,
        styleTarget: input.styleTarget,
        photoConsentConfirmed: input.photoConsentConfirmed,
      }),
    },
  );
  const data = (await response.json().catch(() => ({}))) as SalonRecommendationApiResponse;

  return { data, ok: response.ok };
}

export async function confirmSalonWorkspaceRecord(input: {
  customerId: string;
  generationId: string;
  selectedVariantId: string;
  serviceType: SalonServiceType;
  serviceDate: string;
  nextRecommendedVisitAt: string | null;
  memo: string;
  createAftercare: boolean;
}) {
  const {
    customerId,
    generationId,
    selectedVariantId,
    serviceType,
    serviceDate,
    nextRecommendedVisitAt,
    memo,
    createAftercare,
  } = input;
  const response = await fetch(
    `/api/salon/customers/${encodeURIComponent(customerId)}/workspace/confirm`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generationId,
        selectedVariantId,
        serviceType,
        serviceDate,
        nextRecommendedVisitAt,
        memo,
        createAftercare,
      }),
    },
  );
  const data = (await response.json().catch(() => ({}))) as SalonConfirmResponse;

  return { data, ok: response.ok, status: response.status };
}
