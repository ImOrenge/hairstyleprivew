import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { runGeminiImageGeneration } from "../../../../lib/gemini-image";

interface RunGenerationRequest {
  prompt?: string;
  productRequirements?: string;
  researchReport?: string;
  imageDataUrl?: string;
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as RunGenerationRequest;
  const prompt = body.prompt?.trim();

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  if (prompt.length > 20_000) {
    return NextResponse.json({ error: "prompt is too long" }, { status: 400 });
  }

  if (body.productRequirements && body.productRequirements.length > 30_000) {
    return NextResponse.json({ error: "productRequirements is too long" }, { status: 400 });
  }

  if (body.researchReport && body.researchReport.length > 30_000) {
    return NextResponse.json({ error: "researchReport is too long" }, { status: 400 });
  }

  if (body.imageDataUrl && body.imageDataUrl.length > 12_000_000) {
    return NextResponse.json({ error: "imageDataUrl is too large" }, { status: 400 });
  }

  if (!body.imageDataUrl) {
    return NextResponse.json({ error: "imageDataUrl is required" }, { status: 400 });
  }

  try {
    const result = await runGeminiImageGeneration({
      prompt,
      productRequirements: body.productRequirements?.trim(),
      researchReport: body.researchReport?.trim(),
      imageDataUrl: body.imageDataUrl,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
