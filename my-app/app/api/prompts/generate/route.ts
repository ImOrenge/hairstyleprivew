import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
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

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as GeneratePromptRequest;
  const generationId = body.generationId?.trim();
  const userInput = body.userInput?.trim();
  const styleOptions = body.styleOptions;
  const hasReferenceImage = body.hasReferenceImage === true;
  const referenceImageDataUrl = body.referenceImageDataUrl?.trim();

  if (!userInput) {
    return NextResponse.json({ error: "userInput is required" }, { status: 400 });
  }

  if (referenceImageDataUrl && referenceImageDataUrl.length > 12_000_000) {
    return NextResponse.json({ error: "referenceImageDataUrl is too large" }, { status: 400 });
  }

  if (generationId && !uuidV4LikeRegex.test(generationId)) {
    return NextResponse.json({ error: "generationId must be a valid UUID" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdminClient() as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string; code?: string } | null }>;
          };
        };
        update: (values: Record<string, unknown>) => {
          eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    };

    let originalImagePath: string | null = null;
    let existingOptions: Record<string, unknown> = {};

    if (generationId) {
      const { data: generation, error: generationError } = await supabase
        .from("generations")
        .select("id,user_id,original_image_path,options")
        .eq("id", generationId)
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

    if (generationId) {
      const nextOptions = {
        ...existingOptions,
        normalizedOptions: generated.normalizedOptions,
        promptVersion: generated.promptVersion,
        promptModel: generated.model,
        promptSource: "prompt-generator-api",
        promptUserInput: userInput,
      };

      const { error: updateError } = await supabase
        .from("generations")
        .update({
          prompt_used: generated.prompt,
          options: nextOptions,
        })
        .eq("id", generationId);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    }

    return NextResponse.json(
      {
        generationId: generationId ?? null,
        ...generated,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
