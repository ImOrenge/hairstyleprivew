import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getCreditsPerStyle } from "../../../../lib/pricing-plan";
import { createPromptArtifactToken } from "../../../../lib/prompt-artifact-token";
import { generatePrompt, type PromptStyleOptions } from "../../../../lib/prompt-generator";
import { getSupabaseAdminClient } from "../../../../lib/supabase";

interface GeneratePromptRequest {
  generationId?: string;
  userInput?: string;
  styleOptions?: PromptStyleOptions;
  hasReferenceImage?: boolean;
  referenceImageDataUrl?: string;
}

const uuidV4LikeRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createInlineOriginalImagePath(userId: string): string {
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `inline-upload://${safeUser}/${Date.now()}`;
}

const ALLOWED_STYLE_VALUES = new Set(["straight", "perm", "bangs", "layered"]);
const ALLOWED_COLOR_VALUES = new Set(["black", "brown", "ash", "blonde", "red"]);

function sanitizeStyleOptions(input: PromptStyleOptions | undefined): PromptStyleOptions | undefined {
  if (!input || !isObject(input)) {
    return undefined;
  }

  const normalized: PromptStyleOptions = {};

  if (input.gender === "male" || input.gender === "female" || input.gender === "unisex") {
    normalized.gender = input.gender;
  }

  if (input.length === "short" || input.length === "medium" || input.length === "long") {
    normalized.length = input.length;
  }

  if (typeof input.style === "string") {
    const style = input.style.trim().toLowerCase();
    if (ALLOWED_STYLE_VALUES.has(style)) {
      normalized.style = style;
    }
  }

  if (typeof input.color === "string") {
    const color = input.color.trim().toLowerCase();
    if (ALLOWED_COLOR_VALUES.has(color)) {
      normalized.color = color;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as GeneratePromptRequest;
  const requestedGenerationId = body.generationId?.trim();
  const userInput = body.userInput?.trim();
  const styleOptions = sanitizeStyleOptions(body.styleOptions);
  const hasReferenceImage = body.hasReferenceImage === true;
  const referenceImageDataUrl = body.referenceImageDataUrl?.trim();

  if (!userInput) {
    return NextResponse.json({ error: "userInput is required" }, { status: 400 });
  }

  if (referenceImageDataUrl && referenceImageDataUrl.length > 12_000_000) {
    return NextResponse.json({ error: "referenceImageDataUrl is too large" }, { status: 400 });
  }

  if (requestedGenerationId && !uuidV4LikeRegex.test(requestedGenerationId)) {
    return NextResponse.json({ error: "generationId must be a valid UUID" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdminClient() as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: () => Promise<{
              data: Record<string, unknown> | null;
              error: { message: string; code?: string } | null;
            }>;
          };
        };
        update: (values: Record<string, unknown>) => {
          eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
        };
        insert: (values: Record<string, unknown>) => {
          select: (columns: string) => {
            single: () => Promise<{
              data: Record<string, unknown> | null;
              error: { message: string; code?: string } | null;
            }>;
          };
        };
      };
    };

    let resolvedGenerationId = requestedGenerationId ?? null;
    let originalImagePath: string | null = null;
    let existingOptions: Record<string, unknown> = {};

    if (resolvedGenerationId) {
      const { data: generation, error: generationError } = await supabase
        .from("generations")
        .select("id,user_id,original_image_path,options")
        .eq("id", resolvedGenerationId)
        .maybeSingle();

      if (generationError) {
        return NextResponse.json({ error: generationError.message }, { status: 500 });
      }

      if (!generation) {
        return NextResponse.json({ error: "Generation not found" }, { status: 404 });
      }

      const ownerId = typeof generation.user_id === "string" ? generation.user_id : "";
      if (ownerId !== userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      originalImagePath =
        typeof generation.original_image_path === "string" ? generation.original_image_path : null;
      existingOptions = isObject(generation.options) ? generation.options : {};
    }

    const generated = await generatePrompt({
      userInput,
      styleOptions,
      imageContext: {
        originalImagePath,
        hasReferenceImage,
        referenceImageDataUrl: referenceImageDataUrl || null,
      },
    });

    const nextOptions = {
      ...existingOptions,
      normalizedOptions: generated.normalizedOptions,
      promptVersion: generated.promptVersion,
      promptModel: generated.model,
      promptSource: "prompt-generator-api",
      promptUserInput: userInput,
      promptUsage: generated.usage ?? null,
    };

    if (resolvedGenerationId) {
      const { error: updateError } = await supabase
        .from("generations")
        .update({
          prompt_used: generated.prompt,
          options: nextOptions,
          status: "queued",
          error_message: null,
          credits_used: getCreditsPerStyle(),
          model_provider: "gemini",
          model_name: generated.model,
        })
        .eq("id", resolvedGenerationId);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    } else {
      const { data: created, error: createError } = await supabase
        .from("generations")
        .insert({
          user_id: userId,
          original_image_path: createInlineOriginalImagePath(userId),
          prompt_used: generated.prompt,
          options: nextOptions,
          status: "queued",
          credits_used: getCreditsPerStyle(),
          model_provider: "gemini",
          model_name: generated.model,
        })
        .select("id")
        .single();

      if (createError) {
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }

      const createdGenerationId = typeof created?.id === "string" ? created.id : "";
      if (!createdGenerationId) {
        return NextResponse.json({ error: "Failed to create generation record" }, { status: 500 });
      }

      resolvedGenerationId = createdGenerationId;
    }

    return NextResponse.json(
      {
        generationId: resolvedGenerationId,
        promptArtifactToken: createPromptArtifactToken({
          userId,
          prompt: generated.prompt,
          productRequirements: null,
          researchReport: null,
          model: generated.model,
          promptVersion: generated.promptVersion,
        }),
        ...generated,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
