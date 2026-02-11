import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getCreditsPerStyle } from "../../../../lib/pricing-plan";
import { verifyPromptArtifactToken } from "../../../../lib/prompt-artifact-token";
import { getSupabaseAdminClient } from "../../../../lib/supabase";
import { getGeminiImageModel, runGeminiImageGeneration } from "../../../../lib/gemini-image";

interface RunGenerationRequest {
  generationId?: string;
  prompt?: string;
  promptArtifactToken?: string;
  productRequirements?: string;
  researchReport?: string;
  imageDataUrl?: string;
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

function createInlineGeneratedImagePath(providerRunId: string): string {
  const safeId = providerRunId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `inline-output://${safeId}`;
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as RunGenerationRequest;
  const requestedGenerationId = body.generationId?.trim();
  const prompt = body.prompt?.trim();
  const promptArtifactToken = body.promptArtifactToken?.trim();
  const productRequirements = body.productRequirements?.trim();
  const researchReport = body.researchReport?.trim();

  // Basic Prompt Sanitization: remove excessive whitespace and potential malicious control characters
  const sanitizedPrompt = (prompt ?? "")
    .replace(/[\u0000-\u0008\u000E-\u001F\u007F-\u009F]/g, "") // remove control characters
    .trim();

  if (!sanitizedPrompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  if (!promptArtifactToken) {
    return NextResponse.json({ error: "promptArtifactToken is required" }, { status: 400 });
  }

  if (requestedGenerationId && !uuidV4LikeRegex.test(requestedGenerationId)) {
    return NextResponse.json({ error: "generationId must be a valid UUID" }, { status: 400 });
  }

  if (sanitizedPrompt.length > 20_000) {
    return NextResponse.json({ error: "prompt is too long" }, { status: 400 });
  }

  if (productRequirements && productRequirements.length > 30_000) {
    return NextResponse.json({ error: "productRequirements is too long" }, { status: 400 });
  }

  if (researchReport && researchReport.length > 30_000) {
    return NextResponse.json({ error: "researchReport is too long" }, { status: 400 });
  }

  if (body.imageDataUrl && body.imageDataUrl.length > 12_000_000) {
    return NextResponse.json({ error: "imageDataUrl is too large" }, { status: 400 });
  }

  if (!body.imageDataUrl) {
    return NextResponse.json({ error: "imageDataUrl is required" }, { status: 400 });
  }

  const verification = verifyPromptArtifactToken({
    token: promptArtifactToken,
    userId,
    prompt: sanitizedPrompt,
    productRequirements: productRequirements || null,
    researchReport: researchReport || null,
  });
  if (!verification.ok) {
    return NextResponse.json({ error: "Invalid prompt artifact token" }, { status: 400 });
  }

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
    rpc: (fn: string, params: Record<string, unknown>) => Promise<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };

  const creditCost = getCreditsPerStyle();
  const imageModel = getGeminiImageModel();
  const runStartedAt = new Date().toISOString();

  let generationId = requestedGenerationId ?? "";
  let existingOptions: Record<string, unknown> = {};
  let creditsConsumed = false;

  try {
    if (generationId) {
      const { data: generation, error: generationError } = await supabase
        .from("generations")
        .select("id,user_id,options")
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

      existingOptions = isObject(generation.options) ? generation.options : {};
    } else {
      const seedOptions = {
        runSource: "api/generations/run",
        promptArtifactModel: verification.payload?.model ?? null,
        promptVersion: verification.payload?.pv ?? null,
      };

      const { data: created, error: createError } = await supabase
        .from("generations")
        .insert({
          user_id: userId,
          original_image_path: createInlineOriginalImagePath(userId),
          prompt_used: sanitizedPrompt,
          options: seedOptions,
          status: "processing",
          credits_used: creditCost,
          model_provider: "gemini",
          model_name: imageModel,
        })
        .select("id,options")
        .single();

      if (createError) {
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }

      generationId = typeof created?.id === "string" ? created.id : "";
      if (!generationId) {
        return NextResponse.json({ error: "Failed to create generation record" }, { status: 500 });
      }

      existingOptions = isObject(created?.options) ? created.options : {};
    }

    const processingOptions = {
      ...existingOptions,
      runStartedAt,
      promptArtifactModel: verification.payload?.model ?? null,
      promptVersion: verification.payload?.pv ?? null,
      requestedCreditCost: creditCost,
      imageModel,
    };

    await supabase
      .from("generations")
      .update({
        prompt_used: sanitizedPrompt,
        status: "processing",
        error_message: null,
        credits_used: creditCost,
        model_provider: "gemini",
        model_name: imageModel,
        options: processingOptions,
      })
      .eq("id", generationId);

    const consumeMetadata = {
      source: "api/generations/run",
      promptArtifactModel: verification.payload?.model ?? null,
      promptVersion: verification.payload?.pv ?? null,
      chargedAt: new Date().toISOString(),
    };
    const { error: consumeError } = await supabase.rpc("consume_credits", {
      p_user_id: userId,
      p_generation_id: generationId,
      p_amount: creditCost,
      p_reason: "generation_usage",
      p_metadata: consumeMetadata,
    });

    if (consumeError) {
      await supabase
        .from("generations")
        .update({
          status: "failed",
          error_message: consumeError.message,
        })
        .eq("id", generationId);

      if (consumeError.message.toLowerCase().includes("insufficient credits")) {
        return NextResponse.json({ error: "Insufficient credits" }, { status: 409 });
      }
      return NextResponse.json({ error: consumeError.message }, { status: 500 });
    }
    creditsConsumed = true;

    const result = await runGeminiImageGeneration({
      prompt: sanitizedPrompt,
      productRequirements,
      researchReport,
      imageDataUrl: body.imageDataUrl,
    });

    const completedOptions = {
      ...processingOptions,
      runCompletedAt: new Date().toISOString(),
      imageProviderRunId: result.id,
      imageUsage: result.usage ?? null,
    };

    const { error: completeUpdateError } = await supabase
      .from("generations")
      .update({
        status: "completed",
        error_message: null,
        generated_image_path: createInlineGeneratedImagePath(result.id),
        options: completedOptions,
      })
      .eq("id", generationId);

    if (completeUpdateError) {
      console.error("[generations/run] completed update failed", {
        generationId,
        message: completeUpdateError.message,
      });
    }

    return NextResponse.json(
      {
        id: generationId,
        status: result.status,
        outputUrl: result.outputUrl,
        usage: result.usage ?? null,
        chargedCredits: creditCost,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";

    if (generationId) {
      await supabase
        .from("generations")
        .update({
          status: "failed",
          error_message: message,
        })
        .eq("id", generationId);
    }

    if (creditsConsumed) {
      const refundMetadata = {
        source: "api/generations/run",
        generationId,
        reason: "generation_failed_after_charge",
        error: message,
      };

      const refundResult = await supabase.rpc("grant_credits", {
        p_user_id: userId,
        p_amount: creditCost,
        p_entry_type: "refund",
        p_reason: "generation_failure_refund",
        p_metadata: refundMetadata,
        p_payment_transaction_id: null,
      });

      if (refundResult.error) {
        console.error("[generations/run] refund failed", {
          generationId,
          message: refundResult.error.message,
        });
      }
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
