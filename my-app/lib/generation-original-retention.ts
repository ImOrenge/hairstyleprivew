import "server-only";

import { deriveGenerationOriginalRetentionState } from "@hairfit/shared";
import { getSupabaseAdminClient } from "./supabase";

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdminClient>;

interface GenerationOriginalRetentionSource {
  id: string;
  status: unknown;
  options: unknown;
  original_image_path: unknown;
}

export async function readGenerationOriginalRetentionState(
  client: SupabaseAdminClient,
  generation: GenerationOriginalRetentionSource,
) {
  const { data, error } = await client
    .from("generations")
    .select("original_cleanup_status,original_cleanup_reason,original_retention_expires_at,retry_abandoned_at,original_deleted_at")
    .eq("id", generation.id)
    .maybeSingle();

  if (error) {
    if (!/(schema cache|could not find|does not exist)/i.test(error.message)) {
      console.warn("Generation original retention state could not be read", {
        generationId: generation.id,
        error: error.message,
      });
    }
    return deriveGenerationOriginalRetentionState({
      generationStatus: generation.status,
      options: generation.options,
      originalImagePath: generation.original_image_path,
    });
  }

  return deriveGenerationOriginalRetentionState({
    generationStatus: generation.status,
    options: generation.options,
    originalImagePath: generation.original_image_path,
    cleanupStatus: data?.original_cleanup_status,
    cleanupReason: data?.original_cleanup_reason,
    retentionExpiresAt: data?.original_retention_expires_at,
    retryAbandonedAt: data?.retry_abandoned_at,
    deletedAt: data?.original_deleted_at,
  });
}
