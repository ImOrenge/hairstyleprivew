import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FashionRecommendation } from "./fashion-types";
import { downloadGenerationImageDataUrl } from "./generation-image-storage";
import {
  dataUrlToBuffer,
  getOpenAIImageModel,
  runOpenAIOutfitGeneration,
} from "./openai-image";
import type { GeneratedVariant, RecommendationSet } from "./recommendation-types";
import {
  BODY_PHOTO_BUCKET,
  STYLING_RESULTS_BUCKET,
  normalizeStyleProfile,
} from "./style-profile-server";
import { getSupabaseAdminClient } from "./supabase";

export interface StylingWorkflowExecutionInput {
  sessionId: string;
  attemptId: string;
  leaseToken: string;
}

export class StylingWorkflowTerminalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StylingWorkflowTerminalError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeRecommendationSet(raw: unknown): RecommendationSet | null {
  if (!isObject(raw) || !isObject(raw.analysis) || !Array.isArray(raw.variants)) return null;
  return {
    generatedAt: stringValue(raw.generatedAt) || new Date().toISOString(),
    analysis: raw.analysis as unknown as RecommendationSet["analysis"],
    variants: raw.variants as GeneratedVariant[],
    selectedVariantId: stringValue(raw.selectedVariantId),
    catalogCycleId: stringValue(raw.catalogCycleId),
    creditChargedAt: stringValue(raw.creditChargedAt),
    creditChargeAmount: typeof raw.creditChargeAmount === "number" ? raw.creditChargeAmount : null,
  };
}

function extensionFromMime(mimeType: string) {
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  return "png";
}

async function downloadPrivateImageDataUrl(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  fallbackMimeType = "image/webp",
) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(error?.message || "Failed to download private image");
  const arrayBuffer = await data.arrayBuffer();
  const mimeType = data.type || fallbackMimeType;
  return `data:${mimeType};base64,${Buffer.from(arrayBuffer).toString("base64")}`;
}

async function settleStylingExecution(
  supabase: SupabaseClient,
  input: StylingWorkflowExecutionInput & {
    userId: string;
    outcome: "success" | "failure";
    generatedImagePath?: string | null;
    errorMessage?: string | null;
  },
) {
  const { data, error } = await supabase.rpc("settle_styling_execution", {
    p_styling_session_id: input.sessionId,
    p_user_id: input.userId,
    p_attempt_id: input.attemptId,
    p_lease_token: input.leaseToken,
    p_outcome: input.outcome,
    p_generated_image_path: input.generatedImagePath ?? null,
    p_error_message: input.errorMessage ?? null,
    p_model_provider: input.outcome === "success" ? "openai" : null,
    p_model_name: input.outcome === "success" ? getOpenAIImageModel() : null,
  });
  if (error) throw new Error(error.message);
  return data;
}

async function readAttemptAndSession(
  supabase: SupabaseClient,
  input: StylingWorkflowExecutionInput,
) {
  const { data: attempt, error: attemptError } = await supabase
    .from("styling_credit_attempts")
    .select("*")
    .eq("id", input.attemptId)
    .eq("styling_session_id", input.sessionId)
    .maybeSingle();
  if (attemptError) throw new Error(attemptError.message);
  if (!attempt) throw new StylingWorkflowTerminalError("Styling credit attempt was not found");

  const { data: session, error: sessionError } = await supabase
    .from("styling_sessions")
    .select("*")
    .eq("id", input.sessionId)
    .maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  if (!session) throw new StylingWorkflowTerminalError("Styling session was not found");

  return { attempt, session };
}

function assertCurrentReservedAttempt(
  attempt: Record<string, unknown>,
  input: StylingWorkflowExecutionInput,
) {
  const state = stringValue(attempt.state);
  if (state === "committed" || state === "released") return state;
  if (state !== "reserved") {
    throw new StylingWorkflowTerminalError("Styling credit attempt is not executable");
  }
  if (stringValue(attempt.lease_token) !== input.leaseToken) {
    throw new StylingWorkflowTerminalError("Styling execution lease is stale");
  }
  const expiresAt = Date.parse(stringValue(attempt.lease_expires_at) || "");
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new StylingWorkflowTerminalError("Styling execution lease expired before work started");
  }
  return state;
}

export async function runStylingWorkflowAttempt(
  input: StylingWorkflowExecutionInput,
) {
  const supabase = getSupabaseAdminClient() as unknown as SupabaseClient;
  const initial = await readAttemptAndSession(supabase, input);
  const state = assertCurrentReservedAttempt(initial.attempt, input);
  const userId = stringValue(initial.attempt.user_id);
  if (!userId || userId !== stringValue(initial.session.user_id)) {
    throw new StylingWorkflowTerminalError("Styling execution owner does not match");
  }
  if (state === "committed" && stringValue(initial.session.status) === "completed") {
    return {
      status: "completed",
      replayed: true,
      imagePath: stringValue(initial.session.generated_image_path),
    };
  }
  if (state === "released") {
    throw new StylingWorkflowTerminalError("Styling execution was already refunded");
  }

  const persistedOutputPath = stringValue(initial.attempt.output_object_path);
  if (persistedOutputPath) {
    const receipt = await settleStylingExecution(supabase, {
      ...input,
      userId,
      outcome: "success",
      generatedImagePath: persistedOutputPath,
    });
    return { status: "completed", replayed: true, imagePath: persistedOutputPath, creditReceipt: receipt };
  }

  const generationId = stringValue(initial.session.generation_id);
  if (!generationId) throw new StylingWorkflowTerminalError("Styling generation is unavailable");
  const [{ data: profileRow, error: profileError }, { data: generation, error: generationError }] = await Promise.all([
    supabase.from("user_style_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("generations").select("id,user_id,options").eq("id", generationId).maybeSingle(),
  ]);
  if (profileError) throw new Error(profileError.message);
  if (generationError) throw new Error(generationError.message);
  if (!generation || stringValue(generation.user_id) !== userId) {
    throw new StylingWorkflowTerminalError("Styling generation owner does not match");
  }

  const profile = normalizeStyleProfile(profileRow, userId);
  if (!profile.bodyPhotoPath) {
    throw new StylingWorkflowTerminalError("A full-body photo is required");
  }
  const recommendationSet = normalizeRecommendationSet(
    isObject(generation.options) ? generation.options.recommendationSet : null,
  );
  const selectedVariantId = stringValue(initial.session.selected_variant_id);
  if (!selectedVariantId || recommendationSet?.selectedVariantId !== selectedVariantId) {
    throw new StylingWorkflowTerminalError("The selected hairstyle changed before execution");
  }
  const selectedVariant = recommendationSet.variants.find((variant) => variant.id === selectedVariantId);
  if (!selectedVariant?.outputUrl && !selectedVariant?.generatedImagePath) {
    throw new StylingWorkflowTerminalError("The selected hairstyle image is unavailable");
  }
  if (!isObject(initial.session.recommendation)) {
    throw new StylingWorkflowTerminalError("Styling recommendation is unavailable");
  }
  const recommendation = initial.session.recommendation as unknown as FashionRecommendation;

  const [bodyImageDataUrl, hairImageDataUrl] = await Promise.all([
    downloadPrivateImageDataUrl(supabase, BODY_PHOTO_BUCKET, profile.bodyPhotoPath),
    downloadGenerationImageDataUrl(supabase, {
      outputUrl: selectedVariant.outputUrl,
      generatedImagePath: selectedVariant.generatedImagePath,
    }),
  ]);
  if (!hairImageDataUrl) {
    throw new StylingWorkflowTerminalError("The selected hairstyle image could not be loaded");
  }

  const generated = await runOpenAIOutfitGeneration({
    bodyImageDataUrl,
    hairImageDataUrl,
    recommendation,
    profile,
    hairVariant: selectedVariant,
  });
  const parsed = dataUrlToBuffer(generated.outputUrl);
  const outputObjectPath = `${userId}/${input.sessionId}/${input.attemptId}-${input.leaseToken}.${extensionFromMime(parsed.mimeType)}`;
  const { error: uploadError } = await supabase.storage
    .from(STYLING_RESULTS_BUCKET)
    .upload(outputObjectPath, parsed.buffer, {
      contentType: parsed.mimeType,
      upsert: true,
    });
  if (uploadError) throw new Error(uploadError.message);

  const { data: persistedAttempt, error: persistError } = await supabase
    .from("styling_credit_attempts")
    .update({ output_object_path: outputObjectPath })
    .eq("id", input.attemptId)
    .eq("state", "reserved")
    .eq("lease_token", input.leaseToken)
    .select("id")
    .maybeSingle();
  if (persistError) throw new Error(persistError.message);
  if (!persistedAttempt) {
    throw new StylingWorkflowTerminalError("Styling execution lease became stale before settlement");
  }

  let receipt: unknown;
  try {
    receipt = await settleStylingExecution(supabase, {
      ...input,
      userId,
      outcome: "success",
      generatedImagePath: outputObjectPath,
    });
  } catch (error) {
    const reconciled = await readAttemptAndSession(supabase, input);
    if (
      stringValue(reconciled.attempt.state) !== "committed" ||
      stringValue(reconciled.session.status) !== "completed"
    ) {
      throw error;
    }
    receipt = await supabase.rpc("read_styling_credit_receipt", {
      p_styling_session_id: input.sessionId,
      p_user_id: userId,
    }).then((result) => result.data);
  }

  const previousImagePath = stringValue(initial.session.generated_image_path);
  if (previousImagePath && previousImagePath !== outputObjectPath) {
    const { error: cleanupError } = await supabase.storage
      .from(STYLING_RESULTS_BUCKET)
      .remove([previousImagePath]);
    if (cleanupError) {
      console.warn("[styling-workflow] Previous result cleanup was deferred", {
        sessionId: input.sessionId,
        error: cleanupError.message,
      });
    }
  }

  return {
    status: "completed",
    replayed: false,
    imagePath: outputObjectPath,
    creditReceipt: receipt,
  };
}

export async function failStylingWorkflowAttempt(
  input: StylingWorkflowExecutionInput & { error?: string | null },
) {
  const supabase = getSupabaseAdminClient() as unknown as SupabaseClient;
  const current = await readAttemptAndSession(supabase, input);
  const state = stringValue(current.attempt.state);
  const userId = stringValue(current.attempt.user_id);
  if (!userId) throw new StylingWorkflowTerminalError("Styling execution owner is unavailable");
  if (state === "committed" || state === "released") {
    return { status: state, replayed: true };
  }
  if (state !== "reserved" || stringValue(current.attempt.lease_token) !== input.leaseToken) {
    return { status: state || "stale", replayed: true };
  }

  const receipt = await settleStylingExecution(supabase, {
    ...input,
    userId,
    outcome: "failure",
    errorMessage: "룩북 이미지 생성에 실패해 예약 크레딧을 자동 복구했습니다.",
  });
  const outputObjectPath = stringValue(current.attempt.output_object_path);
  if (outputObjectPath) {
    const { error: cleanupError } = await supabase.storage
      .from(STYLING_RESULTS_BUCKET)
      .remove([outputObjectPath]);
    if (cleanupError) {
      console.warn("[styling-workflow] Failed output cleanup was deferred", {
        sessionId: input.sessionId,
        error: cleanupError.message,
      });
    }
  }
  return { status: "released", replayed: false, creditReceipt: receipt };
}
