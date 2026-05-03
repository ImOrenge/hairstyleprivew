import "server-only";

import {
  STYLING_RESULTS_BUCKET,
  createSignedUrl,
  isStyleProfileComplete,
  normalizeStyleProfile,
  type ServerSupabaseLike,
} from "./style-profile-server";

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

interface PaymentRow {
  id?: unknown;
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
  status: string;
  amountKrw: number;
  creditsToGrant: number;
  paidAt: string | null;
  createdAt: string;
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
  recentGenerations: CustomerHomeGeneration[];
  recentPayments: CustomerHomePayment[];
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

function selectedVariantSummary(options: unknown) {
  const recommendationSet = isRecord(options) && isRecord(options.recommendationSet)
    ? options.recommendationSet
    : null;
  const variants = Array.isArray(recommendationSet?.variants)
    ? recommendationSet.variants.filter(isRecord)
    : [];
  const selectedId = nullableText(recommendationSet?.selectedVariantId);
  const selected = selectedId ? variants.find((item) => item.id === selectedId) : null;
  const fallbackWithImage = variants.find((item) => nullableText(item.outputUrl));
  const fallbackCompleted = variants.find((item) => item.status === "completed");
  const fallback = variants[0] ?? null;
  const variant = selected ?? fallbackWithImage ?? fallbackCompleted ?? fallback;
  const completedVariantCount = variants.filter(
    (item) => item.status === "completed" || nullableText(item.outputUrl) || nullableText(item.generatedImagePath),
  ).length;

  return {
    selectedVariantId: selectedId,
    selectedVariantLabel: nullableText(variant?.label),
    selectedVariantImageUrl: nullableText(variant?.outputUrl),
    completedVariantCount,
    totalVariantCount: variants.length,
  };
}

function recommendationText(recommendation: unknown, key: "headline" | "summary" | "genre") {
  return isRecord(recommendation) ? nullableText(recommendation[key]) : null;
}

export async function loadCustomerHomeDashboard(
  supabase: CustomerHomeSupabase,
  userId: string,
  bootstrap: { credits: number; planKey: string | null },
): Promise<CustomerHomeDashboard> {
  const [generationsRes, paymentsRes, styleProfileRes, stylingSessionsRes] = await Promise.all([
    supabase
      .from<GenerationRow>("generations")
      .select("id,status,prompt_used,generated_image_path,options,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from<PaymentRow>("payment_transactions")
      .select("id,status,amount,credits_to_grant,paid_at,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
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

  const error = generationsRes.error || paymentsRes.error || styleProfileRes.error || stylingSessionsRes.error;
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
    recentGenerations: (generationsRes.data || []).map((row) => ({
      id: text(row.id),
      status: text(row.status) || "unknown",
      promptUsed: nullableText(row.prompt_used),
      generatedImagePath: nullableText(row.generated_image_path),
      ...selectedVariantSummary(isRecord(row.options) ? row.options : null),
      createdAt: text(row.created_at),
    })),
    recentPayments: (paymentsRes.data || []).map((row) => ({
      id: text(row.id),
      status: text(row.status) || "unknown",
      amountKrw: numberValue(row.amount),
      creditsToGrant: numberValue(row.credits_to_grant),
      paidAt: nullableText(row.paid_at),
      createdAt: text(row.created_at),
    })),
    recentStylingSessions,
  };
}
