import "server-only";

import { getGenerationVariantMediaSummary } from "@hairfit/shared";

import {
  STYLING_RESULTS_BUCKET,
  createSignedUrl,
  isStyleProfileComplete,
  normalizeStyleProfile,
  type ServerSupabaseLike,
} from "./style-profile-server";
import { getConfirmedStyleMediaFromRelation } from "./confirmed-style-media";

interface QueryResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

interface QuerySingleResult<T> {
  data: T | null;
  error: { message: string } | null;
}

interface QueryBuilder<T> extends PromiseLike<QueryResult<T>> {
  eq: (column: string, value: unknown) => QueryBuilder<T>;
  order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => QueryBuilder<T>;
  limit: (count: number) => QueryBuilder<T>;
  maybeSingle: () => Promise<QuerySingleResult<T>>;
}

export interface CustomerHomeSupabase {
  from: <T = Record<string, unknown>>(table: string) => {
    select: (columns: string) => QueryBuilder<T>;
  };
  storage: ServerSupabaseLike["storage"];
}

interface GenerationRow {
  id?: unknown;
  status?: unknown;
  prompt_used?: unknown;
  generated_image_path?: unknown;
  options?: unknown;
  created_at?: unknown;
}

interface ConfirmedStyleRow {
  id?: unknown;
  generation_id?: unknown;
  style_name?: unknown;
  service_type?: unknown;
  service_date?: unknown;
  next_visit_target_days?: unknown;
  created_at?: unknown;
  generation?: unknown;
}

interface PaymentRow {
  id?: unknown;
  provider?: unknown;
  metadata?: unknown;
  status?: unknown;
  amount?: unknown;
  credits_to_grant?: unknown;
  paid_at?: unknown;
  created_at?: unknown;
}

interface StylingSessionRow {
  id?: unknown;
  generation_id?: unknown;
  selected_variant_id?: unknown;
  genre?: unknown;
  occasion?: unknown;
  mood?: unknown;
  recommendation?: unknown;
  status?: unknown;
  error_message?: unknown;
  credits_used?: unknown;
  generated_image_path?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}

interface StyleProfileRow {
  height_cm?: unknown;
  body_shape?: unknown;
  top_size?: unknown;
  bottom_size?: unknown;
  fit_preference?: unknown;
  color_preference?: unknown;
  exposure_preference?: unknown;
  avoid_items?: unknown;
  body_photo_path?: unknown;
  body_photo_consent_at?: unknown;
  updated_at?: unknown;
}

export interface CustomerHomeGeneration {
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

export interface CustomerHomePayment {
  id: string;
  provider: string;
  productKey: string | null;
  status: string;
  amountKrw: number;
  creditsToGrant: number;
  paidAt: string | null;
  createdAt: string;
}

interface RefundRow {
  id?: unknown;
  payment_transaction_id?: unknown;
  status?: unknown;
  outcome_choice?: unknown;
  reason_category?: unknown;
  decision?: unknown;
  risk_codes?: unknown;
  amount_krw?: unknown;
  original_amount_krw?: unknown;
  credits_to_claw_back?: unknown;
  requested_at?: unknown;
  completed_at?: unknown;
  support_case_id?: unknown;
  failed_message?: unknown;
}

export interface CustomerHomeConfirmedStyle {
  id: string;
  generationId: string | null;
  styleName: string;
  serviceType: string;
  serviceDate: string;
  nextVisitTargetDays: number;
  selectedVariantId: string | null;
  selectedVariantImageUrl: string | null;
  confirmedAt: string;
}

export interface CustomerHomeStylingSession {
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

export interface CustomerHomeDashboard {
  credits: number;
  planKey: string | null;
  styleProfileReady: boolean;
  recentConfirmedStyles: CustomerHomeConfirmedStyle[];
  recentGenerations: CustomerHomeGeneration[];
  recentPayments: CustomerHomePayment[];
  recentRefundRequests: import("@hairfit/shared").RefundRequestSummary[];
  recentStylingSessions: CustomerHomeStylingSession[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown) {
  const normalized = text(value).trim();
  return normalized || null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function recommendationText(recommendation: unknown, key: "headline" | "summary" | "genre") {
  return isRecord(recommendation) ? nullableText(recommendation[key]) : null;
}

export async function loadCustomerHomeDashboard(
  supabase: CustomerHomeSupabase,
  userId: string,
  bootstrap: { credits: number; planKey: string | null },
): Promise<CustomerHomeDashboard> {
  const [generationsRes, confirmedStylesRes, paymentsRes, refundRequestsRes, styleProfileRes, stylingSessionsRes] = await Promise.all([
    supabase
      .from<GenerationRow>("generations")
      .select("id,status,prompt_used,generated_image_path,options,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from<ConfirmedStyleRow>("user_hair_records")
      .select("id,generation_id,style_name,service_type,service_date,next_visit_target_days,created_at,generation:generations(selected_variant_id,options)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from<PaymentRow>("payment_transactions")
      .select("id,provider,metadata,status,amount,credits_to_grant,paid_at,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from<RefundRow>("payment_refund_requests")
      .select("id,payment_transaction_id,status,outcome_choice,reason_category,decision,risk_codes,amount_krw,original_amount_krw,credits_to_claw_back,requested_at,completed_at,support_case_id,failed_message")
      .eq("user_id", userId)
      .order("requested_at", { ascending: false })
      .limit(10),
    supabase
      .from<StyleProfileRow>("user_style_profiles")
      .select("height_cm,body_shape,top_size,bottom_size,fit_preference,color_preference,exposure_preference,avoid_items,body_photo_path,body_photo_consent_at,updated_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from<StylingSessionRow>("styling_sessions")
      .select("id,generation_id,selected_variant_id,genre,occasion,mood,recommendation,status,error_message,credits_used,generated_image_path,created_at,updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const error = generationsRes.error || confirmedStylesRes.error || paymentsRes.error || refundRequestsRes.error || styleProfileRes.error || stylingSessionsRes.error;
  if (error) {
    throw new Error(error.message);
  }

  const recentStylingSessions = await Promise.all(
    (stylingSessionsRes.data || []).map(async (row) => {
      const generatedImagePath = nullableText(row.generated_image_path);
      const imageUrl = await createSignedUrl(
        supabase as unknown as ServerSupabaseLike,
        STYLING_RESULTS_BUCKET,
        generatedImagePath,
      );

      return {
        id: text(row.id),
        generationId: text(row.generation_id),
        selectedVariantId: text(row.selected_variant_id),
        genre: nullableText(row.genre) ?? recommendationText(row.recommendation, "genre"),
        occasion: nullableText(row.occasion),
        mood: nullableText(row.mood),
        headline: recommendationText(row.recommendation, "headline"),
        summary: recommendationText(row.recommendation, "summary"),
        status: text(row.status) || "unknown",
        errorMessage: nullableText(row.error_message),
        creditsUsed: numberValue(row.credits_used),
        generatedImagePath,
        imageUrl,
        createdAt: text(row.created_at),
        updatedAt: nullableText(row.updated_at),
      };
    }),
  );

  const profile = normalizeStyleProfile(
    isRecord(styleProfileRes.data) ? styleProfileRes.data : null,
    userId,
  );

  return {
    credits: bootstrap.credits,
    planKey: bootstrap.planKey,
    styleProfileReady: isStyleProfileComplete(profile),
    recentConfirmedStyles: (confirmedStylesRes.data || []).map((row) => {
      const media = getConfirmedStyleMediaFromRelation(row.generation);
      return {
        id: text(row.id),
        generationId: nullableText(row.generation_id),
        styleName: nullableText(row.style_name) || "확정 헤어스타일",
        serviceType: nullableText(row.service_type) || "other",
        serviceDate: text(row.service_date),
        nextVisitTargetDays: numberValue(row.next_visit_target_days),
        selectedVariantId: media.selectedVariantId,
        selectedVariantImageUrl: media.selectedVariantImageUrl,
        confirmedAt: text(row.created_at),
      };
    }),
    recentGenerations: (generationsRes.data || []).map((row) => ({
      id: text(row.id),
      status: text(row.status) || "unknown",
      promptUsed: nullableText(row.prompt_used),
      generatedImagePath: nullableText(row.generated_image_path),
      ...getGenerationVariantMediaSummary(isRecord(row.options) ? row.options : null),
      createdAt: text(row.created_at),
    })),
    recentPayments: (paymentsRes.data || []).map((row) => ({
      id: text(row.id),
      provider: text(row.provider),
      productKey: isRecord(row.metadata)
        ? nullableText(row.metadata.productKey) ?? nullableText(row.metadata.plan) ?? nullableText(row.metadata.pack)
        : null,
      status: text(row.status) || "unknown",
      amountKrw: numberValue(row.amount),
      creditsToGrant: numberValue(row.credits_to_grant),
      paidAt: nullableText(row.paid_at),
      createdAt: text(row.created_at),
    })),
    recentRefundRequests: (refundRequestsRes.data || []).map((row) => ({
      id: text(row.id),
      paymentTransactionId: text(row.payment_transaction_id),
      status: (text(row.status) || "pending") as import("@hairfit/shared").RefundRequestStatus,
      outcome: (text(row.outcome_choice) || "immediate_refund_and_cancel") as import("@hairfit/shared").RefundOutcome,
      reasonCategory: (text(row.reason_category) || "other") as import("@hairfit/shared").RefundReasonCategory,
      decision: (text(row.decision) || "manual") as import("@hairfit/shared").RefundDecision,
      riskCodes: Array.isArray(row.risk_codes) ? row.risk_codes.filter((value): value is import("@hairfit/shared").RefundRiskCode => typeof value === "string") : [],
      refundAmountKrw: numberValue(row.amount_krw ?? row.original_amount_krw),
      creditsToClawBack: numberValue(row.credits_to_claw_back),
      requestedAt: text(row.requested_at),
      completedAt: nullableText(row.completed_at),
      supportCaseId: nullableText(row.support_case_id),
      failureMessage: nullableText(row.failed_message),
    })),
    recentStylingSessions,
  };
}
