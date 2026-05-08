import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const GENERATION_RESULTS_BUCKET = "generation-results";

interface SupabaseStorageLike {
  storage: SupabaseClient["storage"];
}

interface GenerationImageReference {
  generatedImagePath?: string | null;
  outputUrl?: string | null;
}

function isDataUrl(value: string) {
  return value.startsWith("data:image/");
}

function isRemoteUrl(value: string) {
  return value.startsWith("http://") || value.startsWith("https://");
}

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mimeType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("imageDataUrl must be a valid base64 data URL");
  }

  return {
    mimeType: match[1] || "image/png",
    buffer: Buffer.from(match[2] || "", "base64"),
  };
}

function extensionFromMime(mimeType: string) {
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  return "png";
}

function isStorageImagePath(path: string | null | undefined): path is string {
  return Boolean(path && !path.startsWith("inline-output://") && !isDataUrl(path) && !isRemoteUrl(path));
}

export async function createGenerationImageSignedUrl(
  supabase: SupabaseStorageLike,
  path: string | null | undefined,
  expiresIn = 60 * 30,
) {
  const objectPath = typeof path === "string" ? path : null;
  if (!isStorageImagePath(objectPath)) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(GENERATION_RESULTS_BUCKET)
    .createSignedUrl(objectPath, expiresIn);

  if (error) {
    throw new Error(error.message);
  }

  return data?.signedUrl ?? null;
}

export async function uploadGenerationResultImage(
  supabase: SupabaseStorageLike,
  input: {
    userId: string;
    generationId: string;
    variantId: string;
    imageDataUrl: string;
    previousPath?: string | null;
  },
) {
  const parsed = dataUrlToBuffer(input.imageDataUrl);
  const extension = extensionFromMime(parsed.mimeType);
  const safeVariantId = input.variantId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const objectPath = `${input.userId}/${input.generationId}/${safeVariantId}-${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from(GENERATION_RESULTS_BUCKET)
    .upload(objectPath, parsed.buffer, {
      contentType: parsed.mimeType,
      upsert: true,
    });

  if (error) {
    throw new Error(error.message);
  }

  if (isStorageImagePath(input.previousPath) && input.previousPath !== objectPath) {
    await supabase.storage.from(GENERATION_RESULTS_BUCKET).remove([input.previousPath]);
  }

  const signedUrl = await createGenerationImageSignedUrl(supabase, objectPath);
  return { path: objectPath, signedUrl };
}

export async function resolveGenerationImageUrl(
  supabase: SupabaseStorageLike,
  reference: GenerationImageReference,
) {
  const outputUrl = reference.outputUrl?.trim() || null;
  if (outputUrl && (isDataUrl(outputUrl) || isRemoteUrl(outputUrl))) {
    return outputUrl;
  }

  const generatedImagePath = reference.generatedImagePath?.trim() || null;
  return createGenerationImageSignedUrl(supabase, generatedImagePath);
}

export async function downloadGenerationImageDataUrl(
  supabase: SupabaseStorageLike,
  reference: GenerationImageReference,
) {
  const outputUrl = reference.outputUrl?.trim() || null;
  if (outputUrl && isDataUrl(outputUrl)) {
    return outputUrl;
  }

  if (outputUrl && isRemoteUrl(outputUrl)) {
    const response = await fetch(outputUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get("content-type") || "image/webp";
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  }

  const generatedImagePath = reference.generatedImagePath?.trim() || null;
  if (!isStorageImagePath(generatedImagePath)) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(GENERATION_RESULTS_BUCKET)
    .download(generatedImagePath);

  if (error || !data) {
    throw new Error(error?.message || "Failed to download generated image");
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const mimeType = data.type || "image/webp";
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}
